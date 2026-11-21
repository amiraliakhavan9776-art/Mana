'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{once}=require('node:events');
const {start}=require('./aec-instruction-preview.cjs');
const {createAecInstructionRunner}=require('./aec-instruction-runner.cjs');
const {APPROVED_PERSIAN_COMMAND}=require('./persian-intake.cjs');
const baseDir=path.resolve(__dirname,'..');
const node24=Number(process.versions.node.split('.')[0])>=24;
const masterPath=process.env.MANA_TEST_MASTER;
const capturePath=process.env.MANA_TEST_INDOT_CAPTURE;
const pin='2d78ddee786ffcba28391e053ce2ef923ad70bb6de4d0a58d136e45a0f002b33';
async function serve(t,runner){
 const s=start({runner});await once(s,'listening');
 assert.equal(s.address().address,'127.0.0.1');
 const close=()=>new Promise((a,b)=>s.close(e=>e?b(e):a()));
 t.after(()=>{if(s.listening)return close();});
 const url='http://127.0.0.1:'+s.address().port;
 const html=await (await fetch(url)).text();
 assert.match(html,/<html lang="fa" dir="rtl"/);
 assert.match(html,/دستور فارسی مأموریت/);
 assert(html.includes(APPROVED_PERSIAN_COMMAND));
 const token=html.match(/'X-Mana-Token':'([0-9a-f]{64})'/)[1];
 return {url,close,go:(body,more={})=>fetch(url+'/run',{method:'POST',headers:{origin:url,'x-mana-token':token,'content-type':'application/json',...more},body}),history:()=>fetch(url+'/history')};
}
test('private Persian preview uses an exact text-only POST and rejects cross-origin/token/schema abuse without dispatch',async t=>{
 const got=[];
 const s=await serve(t,{run:x=>{got.push(x);return {status:'REJECTED'};},history:()=>null});
 const msg=JSON.stringify({instruction:APPROVED_PERSIAN_COMMAND});
 assert.equal((await s.go(msg,{origin:'https://example.org'})).status,403);
 assert.equal((await s.go(msg,{'x-mana-token':'x'.repeat(64)})).status,403);
 assert.equal((await s.go('{"instruction":"a","instruction":"b"}')).status,400);
 assert.equal((await s.go(JSON.stringify({instruction:'x'.repeat(2100)}))).status,413);
 assert.equal((await s.go(JSON.stringify({instruction:'a',target:'https://example.org'}))).status,400);
 assert.equal((await fetch(s.url+'/approve')).status,404);
 assert.deepEqual(got,[]);
 assert.equal((await s.go(msg)).status,200);
 assert.deepEqual(got,[APPROVED_PERSIAN_COMMAND]);
});
function config(t,discover){
 const workspace=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mana-aec-http-')));
 t.after(()=>fs.rmSync(workspace,{recursive:true,force:true}));
 const {learnAec,readAecLearning}=require('./aec-learner.cjs');
 return {workspace,masterBytes:fs.readFileSync(masterPath),queueBytes:fs.readFileSync(path.join(baseDir,'capability-registry/development-queue-v01.json')),sourceMode:'pinned-replay',discover,learn:learnAec,readLearning:readAecLearning};
}
test('valid private master, unsupported text has no effects and missing source records a single safe stop',{skip:!node24||!masterPath},async t=>{
 let calls=0;
 const c=config(t,()=>{calls++;throw Error('OFFLINE');});
 const s=await serve(t,createAecInstructionRunner(c));
 const invalid=await (await s.go(JSON.stringify({instruction:'همین حالا فعال کن'}))).json();
 assert.equal(invalid.status,'REJECTED');assert.equal(calls,0);assert.deepEqual(fs.readdirSync(c.workspace),[]);
 const body=JSON.stringify({instruction:APPROVED_PERSIAN_COMMAND});
 const blocked=await (await s.go(body)).json();
 assert.equal(blocked.status,'SOURCE_BLOCKED');assert.equal(blocked.activationAuthorized,false);assert.equal(calls,1);
 assert.equal((await (await s.go(body)).json()).reused,true);assert.equal(calls,1);
 assert.equal(fs.existsSync(path.join(c.workspace,'learner')),false);
});
test('actual reviewed INDOT capture through HTTP to isolated CPU learner, verified receipt survives restart',{skip:!node24||!masterPath||!capturePath},async t=>{
 const {readCapturedPanelEvidence}=require('./aec-source.cjs');
 let calls=0;
 const c=config(t,()=>{calls++;return readCapturedPanelEvidence(capturePath,pin);});
 const first=await serve(t,createAecInstructionRunner(c));
 const body=JSON.stringify({instruction:APPROVED_PERSIAN_COMMAND});
 const r=await (await first.go(body)).json();
 assert.equal(r.status,'AWAITING_HUMAN_REVIEW',JSON.stringify(r));
 assert.equal(r.sourceMode,'pinned-replay');assert.equal(r.passed,16);assert.equal(r.total,16);assert.equal(r.activationAuthorized,false);
 assert.equal(r.missionId,'6d213a1b0d0b2a93');
 assert.equal(calls,1);
 await first.close();
 const again=await serve(t,createAecInstructionRunner(c));
 const saved=await (await again.history()).json();
 assert.equal(saved.reused,true);assert.equal(saved.candidateSha256,r.candidateSha256);assert.equal(calls,1);
 fs.appendFileSync(path.join(c.workspace,'source.json'),' ');
 assert.equal((await again.history()).status,503);
 assert.equal((await again.go(body)).status,503);
 assert.equal(calls,1);
});
