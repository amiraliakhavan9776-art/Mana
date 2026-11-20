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
test('two reviewed mappings use same engine, select/retrieve distinct corpus, no test data in model packet',async t=>{
 const fixture=setup(t),w=fixture.start();const first=w.inspect();assert.equal(first.next,'net-finish-length-mm');assert.equal(first.section,'6.4');assert.deepEqual(first.research.selected.map(x=>x.id).sort(),['floor-continuity','takeoff-trace']);assert.equal(first.research.rejected.length,3);
 let calls=0;const one=await w.proposeNext({providerId:'local-fixture',propose:async p=>{calls++;assert.deepEqual(Object.keys(p).sort(),['fields','goal','grammar','maxInput','notes','outputUnit']);for(const secret of ['27700','2300','1200','27.7','master.txt','expected','anchors','tests'])assert.ok(!JSON.stringify(p).includes(secret));return net;}});
 assert.equal(one.evidence.status,'AWAITING_HUMAN_REVIEW');assert.equal(one.evidence.score.passed,8);assert.equal(one.evidence.activationAuthorized,false);
 const next=fixture.start().inspect();assert.equal(next.next,'uniform-layer-volume-mm3');assert.equal(next.section,'6.6');assert.ok(next.research.rejected.some(x=>x.reason==='no-matching-term'));
 const two=await fixture.start().proposeNext({providerId:'local-fixture',propose:async p=>{calls++;assert.equal(p.outputUnit,'mm3');assert.ok(p.fields.includes('thickness_mm'));return volume;}});
 assert.equal(two.evidence.status,'AWAITING_HUMAN_REVIEW');assert.equal(two.evidence.score.passed,8);assert.equal(w.inspect().status,'COMPLETE');assert.equal((await w.proposeNext({providerId:'local-fixture',propose:noop})).modelRequestsAttempted,0);assert.equal(calls,2);
 const id='uniform-layer-volume-mm3',digest=two.digest;await w.approve({id,digest,reason:'fixture'});await w.activate({id,digest});
 assert.equal((await w.run({id,digest,values:[10000,10000,10000]})).output,1e12);
 await assert.rejects(w.run({id,digest,values:[10001,10000,10000]}),/EXACT_SYNTHETIC/);
});
test('only candidate-bound explicit approval activates; cold run works without model; deactivation is terminal',async t=>{
 const X=setup(t),w=X.start(),id='net-finish-length-mm';const r=await w.proposeNext({providerId:'fixture-model',propose:async()=>net}),digest=r.digest;
 await assert.rejects(w.run({id,digest,values:[8000,7000,2300]}));await assert.rejects(w.approve({id,digest:'0'.repeat(64),reason:'review'}),/NOT_APPROVABLE/);
 assert.equal((await w.approve({id,digest,reason:'Test-only independent owner review'})).status,'APPROVED_NOT_ACTIVE');
 await assert.rejects(w.run({id,digest,values:[8000,7000,2300]}));assert.equal((await w.activate({id,digest})).status,'ACTIVE_PRIVATE_SYNTHETIC_ONLY');
 const out=await X.start().run({id,digest,values:[8000,7000,2300]});assert.equal(out.output,27700);assert.equal(out.unit,'mm');assert.equal(out.modelCalls,0);assert.equal(out.productionAllowed,false);
 await assert.rejects(w.run({id,digest,values:[8000,7000,2300.1]}),/EXACT_SYNTHETIC/);
 assert.equal((await w.deactivate({id,digest,reason:'End fixture trial'})).status,'DEACTIVATED');await assert.rejects(X.start().run({id,digest,values:[1,1,1]}),/DEACTIVATED/);
});
test('source modification and unresolved model dispatch fail closed without repeat',async t=>{
 const a=setup(t),b=setup(t);fs.appendFileSync(path.join(a.corpus,'floor-continuity.txt'),'tamper');await assert.rejects(a.start().proposeNext({providerId:'fixture',propose:noop}),/HASH_MISMATCH/);assert.deepEqual(fs.readdirSync(a.workspace),[]);
 const old=b.start();let release;const first=old.proposeNext({providerId:'fixture',propose:()=>new Promise(r=>{release=r;})});assert.equal(b.start().inspect().status,'UNKNOWN_OR_BUSY');release(net);await first;
 fs.unlinkSync(path.join(b.workspace,'net-finish-length-mm-review.json'));assert.equal(b.start().inspect().status,'UNKNOWN_OUTCOME');await assert.rejects(b.start().proposeNext({providerId:'fixture',propose:noop}),/NO_RETRY/);
});
test('ineffective expression fails before numerical holdouts and cannot be approved',async t=>{
 const w=setup(t).start(),id='net-finish-length-mm',r=await w.proposeNext({providerId:'fixture',propose:async()=>JSON.stringify(op('add',f('length_mm'),op('multiply',f('excluded_mm'),v(0))))});assert.equal(r.evidence.status,'BENCHMARK_FAILED');assert.equal(r.evidence.score.testsRun,0);assert.deepEqual(r.evidence.score.insensitive,['width_mm','excluded_mm']);await assert.rejects(w.approve({id,digest:r.digest,reason:'should fail'}),/NOT_APPROVABLE/);
});
test('real bounded loopback HTTP sends only reviewed research payload and offline run survives provider shutdown',async t=>{
 const X=setup(t),w=X.start(),http=require('node:http'),{once}=require('node:events'),{createRdLocalAdviser}=require('../src/pilot/mana-rd-local-adviser.cjs');
 let wire,calls=0;const provider=http.createServer(async(req,res)=>{let b='';for await(const c of req)b+=c;calls++;wire=JSON.parse(b);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({metadata:{sec:2.31},choices:[{finish_reason:'stop',message:{role:'assistant',content:net}}]}));});provider.listen(0,'127.0.0.1');await once(provider,'listening');
 const id='net-finish-length-mm';let proof;
 try{proof=await w.proposeNext(createRdLocalAdviser({port:provider.address().port,model:'stub-only'}));assert.equal(calls,1);assert.equal(proof.evidence.status,'AWAITING_HUMAN_REVIEW');const user=JSON.parse(wire.messages[1].content);assert.deepEqual(Object.keys(user).sort(),['fields','goal','maxInput','notes','outputUnit']);assert.equal(user.notes.length,2);for(const secret of ['27700','2300','1200','27.7','master.txt','expected','anchors','tests'])assert.ok(!JSON.stringify(wire).includes(secret));assert.match(wire.grammar,/root ::= n4/);}
 finally{await new Promise(r=>provider.close(r));}
 const digest=proof.digest;await X.start().approve({id,digest,reason:'synthetic test'});await X.start().activate({id,digest});
 assert.equal((await X.start().run({id,digest,values:[8000,7000,2300]})).output,27700);assert.equal(calls,1);
});
