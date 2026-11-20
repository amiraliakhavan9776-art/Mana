'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {createWorkbench}=require('../src/pilot/mana-rd-loop.cjs');
const sha=x=>createHash('sha256').update(x).digest('hex');
const f=field=>({field}),v=value=>({value}),op=(op,a,b)=>({op,args:[a,b]});
const net=JSON.stringify(op('subtract',op('multiply',v(2),op('add',f('length_mm'),f('width_mm'))),f('excluded_mm')));
const volume=JSON.stringify(op('multiply',op('multiply',f('length_mm'),f('width_mm')),f('thickness_mm')));
const noop=()=>{throw Error('PROVIDER_MUST_NOT_RUN');};
function setup(t){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'rd-fixture-')),workspace=path.join(base,'state'),corpus=path.join(base,'corpus');
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));fs.mkdirSync(workspace,{mode:0o700});fs.cpSync(path.resolve(__dirname,'../rd-pilot'),corpus,{recursive:true});
 const masterPath=path.join(base,'master.txt'),parts=['Synthetic section for traceable linear work.\n','Synthetic section for numerical units and version.\n'],master=Buffer.from(parts.join(''));fs.writeFileSync(masterPath,master);
 const catalogPath=path.join(corpus,'catalog.json'),catalog=JSON.parse(fs.readFileSync(catalogPath));catalog.masterSha256=sha(master);let start=0;
 for(const [i,m]of catalog.missions.entries()){const bytes=Buffer.from(parts[i]);m.range=[start,start+bytes.length];m.sectionSha256=sha(bytes);start+=bytes.length;}
 const bytes=Buffer.from(JSON.stringify(catalog));fs.writeFileSync(catalogPath,bytes);const config={workspace,masterPath,catalogPath,catalogSha256:sha(bytes)};
 return {workspace,corpus,config,start:()=>createWorkbench(config)};
}
const {createFeedback}=require('../src/pilot/mana-rd-feedback.cjs');
const MISSION='net-finish-length-mm',priorCandidate=JSON.stringify(f('length_mm')),transport='1'.repeat(64);
const options=propose=>({providerId:'local-fixture',transportSha256:transport,propose});
async function history(t,providerId='local-fixture'){
 const fixture=setup(t),prior=await fixture.start().proposeNext({providerId,propose:async()=>priorCandidate});
 assert.equal(prior.evidence.status,'BENCHMARK_FAILED');assert.deepEqual(prior.evidence.score.insensitive,['width_mm','excluded_mm']);assert.equal(prior.evidence.score.testsRun,0);
 const config={...fixture.config,priorWorkspace:fixture.workspace,mission:MISSION,expectedPriorDigest:prior.digest,expectedMissing:['width_mm','excluded_mm']};
 return {...fixture,prior,config,make:()=>createFeedback(config),feedback:fixture.workspace+'-feedback-v1'};
}
function snapshot(p){return Object.fromEntries(fs.readdirSync(p).map(x=>[x,fs.readFileSync(path.join(p,x)).toString('hex')]));}
test('one deliberate repair uses failure fields only and preserves original receipt; valid correction review-only',async t=>{
 const h=await history(t),before=snapshot(h.workspace),r=h.make();let calls=0;
 assert.equal(r.inspect().status,'READY');assert.equal(fs.existsSync(h.feedback),false);
 await assert.rejects(r.repair({...options(noop),providerId:'wrong-model'}),/RETRY_PROVIDER/);
 const out=await r.repair(options(async p=>{calls++;assert.deepEqual(p.ineffectiveFields,['width_mm','excluded_mm']);for(const forbidden of [priorCandidate,h.prior.digest,'27700','8000','2300','suiteSha256','master.txt'])assert.ok(!JSON.stringify(p).includes(forbidden));assert.equal(JSON.parse(fs.readFileSync(path.join(h.feedback,'claim.json'))).budget,1);return net;}));
 assert.equal(out.status,'AWAITING_HUMAN_REVIEW');assert.equal(out.evidence.score.passed,8);assert.equal(out.evidence.safety.activationAuthorized,false);assert.equal(typeof r.activate,'undefined');
 assert.equal((await h.make().repair(options(noop))).modelRequestsAttempted,0);assert.equal(calls,1);assert.deepEqual(snapshot(h.workspace),before);
});
test('exact, equivalent duplicate, invalid and still ineffective proposals all stop at an immutable reviewed failure',async t=>{
 const noEffect=JSON.stringify(op('add',f('length_mm'),op('multiply',v(0),f('excluded_mm'))));
 for(const [proposed,want]of [[priorCandidate,'DUPLICATE_PROPOSAL'],[noEffect,'DUPLICATE_PROPOSAL'],['{"field":"length_mm","field":"width_mm"}','INVALID_PROPOSAL'],[JSON.stringify(op('add',f('width_mm'),f('length_mm'))),'BENCHMARK_FAILED']]){
  const h=await history(t),r=h.make();let calls=0;
  const out=await r.repair(options(async()=>{calls++;return proposed;}));assert.equal(out.status,want);assert.equal(r.inspect().status,want);assert.equal((await r.repair(options(noop))).modelRequestsAttempted,0);assert.equal(calls,1);
  if(want==='BENCHMARK_FAILED')assert.deepEqual(out.evidence.score.insensitive,['excluded_mm']);
 }
});
test('bad digest, copied original workspace and source change block before dispatch',async t=>{
 const h=await history(t),copy=h.workspace+'-copy';fs.cpSync(h.workspace,copy,{recursive:true});fs.chmodSync(copy,0o700);let calls=0;const proposal=options(async()=>{calls++;return net;});
 await assert.rejects(createFeedback({...h.config,expectedPriorDigest:'0'.repeat(64)}).repair(proposal),/PINNED/);
 await assert.rejects(createFeedback({...h.config,priorWorkspace:copy}).repair(proposal),/UNVERIFIED/);
 fs.appendFileSync(path.join(h.corpus,'floor-continuity.txt'),'tampered');await assert.rejects(h.make().repair(proposal),/HASH/);assert.equal(calls,0);assert.equal(fs.existsSync(h.feedback),false);
});
test('competition and altered prior during proposal leave no new valid outcome and never retry',async t=>{
 const h=await history(t);let release,calls=0;const start=h.make().repair(options(()=>{calls++;return new Promise(r=>release=r);}));assert.equal((await h.make().repair(options(noop))).status,'UNKNOWN_OUTCOME_NO_RETRY');
 const old=path.join(h.workspace,MISSION+'-review.json'),bytes=fs.readFileSync(old);fs.appendFileSync(old,'\n');release(net);await assert.rejects(start,/EVIDENCE_CHANGED/);fs.writeFileSync(old,bytes);
 assert.equal(h.make().inspect().status,'UNKNOWN_OUTCOME_NO_RETRY');assert.equal((await h.make().repair(options(noop))).status,'UNKNOWN_OUTCOME_NO_RETRY');assert.equal(calls,1);
});
test('loopback payload contains fixed fields and no previous candidate or evaluation data',async t=>{
 const http=require('node:http'),{once}=require('node:events'),{createFeedbackAdviser}=require('../src/pilot/mana-rd-feedback-adviser.cjs');let wire;
 const s=http.createServer(async(req,res)=>{let b='';for await(const c of req)b+=c;wire=JSON.parse(b);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({timing:{seconds:0.14},choices:[{finish_reason:'stop',message:{role:'assistant',content:net}}]}));});s.listen(0,'127.0.0.1');await once(s,'listening');t.after(()=>new Promise(r=>s.close(r)));
 const adviser=createFeedbackAdviser({port:s.address().port,model:'fixture-only'}),h=await history(t,adviser.providerId);
 const result=await h.make().repair(adviser);assert.equal(result.status,'AWAITING_HUMAN_REVIEW');
 const user=JSON.parse(wire.messages[1].content);assert.deepEqual(user.ineffectiveFields,['width_mm','excluded_mm']);assert.deepEqual(Object.keys(user).sort(),['fields','goal','ineffectiveFields','maxInput','notes','outputUnit']);
 for(const x of ['27700','2300','8000',priorCandidate,h.prior.digest,'testsRun','master.txt'])assert.ok(!JSON.stringify(wire).includes(x));
});
test('dependent wrong numeric proposal runs holdouts, and copied feedback cannot replay or dispatch',async t=>{
 const h=await history(t),wrong=JSON.stringify(op('add',JSON.parse(net),v(1)));let calls=0;
 const r=await h.make().repair(options(async()=>{calls++;return wrong;}));assert.equal(r.status,'BENCHMARK_FAILED');assert.deepEqual(r.evidence.score.insensitive,[]);assert.equal(r.evidence.score.testsRun,8);assert.equal(r.evidence.score.passed,0);
 fs.renameSync(h.feedback,h.feedback+'-original');fs.cpSync(h.feedback+'-original',h.feedback,{recursive:true});fs.chmodSync(h.feedback,0o700);
 assert.equal(h.make().inspect().status,'UNKNOWN_OUTCOME_NO_RETRY');assert.equal((await h.make().repair(options(noop))).modelRequestsAttempted,0);assert.equal(calls,1);
});
