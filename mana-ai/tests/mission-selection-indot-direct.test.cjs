'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),https=require('node:https'),{EventEmitter,once}=require('node:events');
const {INDEX_URL,SOURCE_URL}=require('../research-preview/aec-source.cjs');
const {APPROVED_MISSION_SELECTION_COMMAND:instruction}=require('../research-preview/mission-selection-runner.cjs');
const {start}=require('../research-preview/aec-instruction-preview.cjs');

const live=process.env.MANA_TEST_DIRECT_INDOT==='1';
const masterPath=process.env.MANA_TEST_MASTER,pythonPath=process.env.MANA_INDOT_PYTHON;
const cp=process.env.MANA_SELECTION_CPYTHON??'--official-https';
const rawFixtures=process.env.MANA_INDOT_RAW_FIXTURES;
const priorTree=process.env.MANA_PRIOR_PR19_WORKTREE;
async function integration(t,{recover=false}={}){

 assert(masterPath&&pythonPath,'Private master and approved Python runtime required for live opt-in');
 const {openMissionSelection}=require('../research-preview/mission-selection-preview.cjs');
 const workspace=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mana-direct-indot-ui-')));
 t.after(()=>fs.rmSync(workspace,{recursive:true,force:true}));
 let current;
 async function launch(open=openMissionSelection){
  current=start({missionSelection:true,runner:open({workspace,masterPath,cpythonSource:cp,pythonPath})});
  await once(current,'listening');
  assert.equal(current.address().address,'127.0.0.1');
  const url='http://127.0.0.1:'+current.address().port;
  const page=await (await fetch(url)).text();
  assert.match(page,/برو جلو/);
  assert(page.includes(instruction));
  const token=page.match(/'X-Mana-Token':'([a-f0-9]{64})'/)[1];
  return {history:async()=>await(await fetch(url+'/history')).json(),run:async()=>{const r=await fetch(url+'/run',{method:'POST',headers:{origin:url,'x-mana-token':token,'content-type':'application/json'},body:JSON.stringify({instruction})});const result=await r.json();assert.equal(r.status,200,JSON.stringify(result));return result;}};
 }
 const close=()=>new Promise((resolve,reject)=>{
  if(!current?.listening)return resolve();
  current.close(e=>e?reject(e):resolve());
 });
 t.after(close);
 const previous=priorTree&&recover?require(path.join(priorTree,'mana-ai/research-preview/mission-selection-preview.cjs')).openMissionSelection:undefined;
 let u=await launch(previous);
 const first=await u.run();
 assert.equal(first.status,'AWAITING_HUMAN_REVIEW',JSON.stringify(first));
 assert.equal(first.missionId,'88ab05d456850cd0');assert.equal(first.passed,16);
 let original;
 const saved=relative=>fs.readFileSync(path.join(workspace,relative));
 if(recover){
  const timeout=await u.run();
  assert.equal(timeout.status,'SOURCE_BLOCKED',JSON.stringify(timeout));
  assert.equal(timeout.sourceFailureCode,'INDOT_HTTPS_TIMEOUT');
  assert.equal(timeout.validatedCount,1);
  original=Object.fromEntries(['research/claim.json','research/terminal.json','quantity/claim.json','quantity/terminal.json'].map(p=>[p,saved(p)]));
  assert(!fs.existsSync(path.join(workspace,'quantity','source.json')));
  if(previous)assert.equal((await u.history()).retryAvailable,undefined);
  await close();u=await launch();
  const history=await u.history();
  assert.equal(history.retryAvailable,true);assert.equal(history.validatedCount,1);
 }
 const second=await u.run();
 if(recover){assert.equal(second.recoveryAttempt,true);assert.equal(second.previousFailureCode,'INDOT_HTTPS_TIMEOUT');}
 assert.equal(second.status,'AWAITING_HUMAN_REVIEW',JSON.stringify(second));
 assert.equal(second.missionId,'6d213a1b0d0b2a93');assert.equal(second.sourceMode,'direct');
 assert.equal(second.passed,16);assert.equal(second.total,16);assert.equal(second.activationAuthorized,false);
 const artifact=JSON.parse(fs.readFileSync(path.join(workspace,'quantity',...(recover?['retry-timeout']:[]),'source.json'),'utf8'));
 assert.equal(artifact.evidence.directRuntimeNetwork,true);
 if(recover)for(const [p,bytes] of Object.entries(original))assert(saved(p).equals(bytes),p+' must remain unchanged');
 assert.equal(artifact.sourceSha256,'61cee6fc891b0121c424e3c9b8ee1610e87c06341c38c916123ac82850692968');
 await close();u=await launch();
 for(const stop of [await u.history(),await u.run()]){
  assert.equal(stop.status,'NO_READY_CASE');
  assert.equal(stop.completed.length,2);
  assert.equal(stop.activationAuthorized,false);
 }
}
test('live INDOT: Persian loop validates the published PDF and stops after both receipts',{skip:!live,timeout:115000},integration);
test('recorded raw publisher bytes: full HTTP/Python/CPU path with only HTTPS transport simulated',{skip:!rawFixtures||!masterPath||!pythonPath||cp==='--official-https',timeout:30000},async t=>{
 const requests=[];
 const data={
  [INDEX_URL]:{bytes:fs.readFileSync(path.join(rawFixtures,'index.html')),mime:'text/html'},
  [SOURCE_URL]:{bytes:fs.readFileSync(path.join(rawFixtures,'indot.pdf')),mime:'application/pdf'},
 };
 t.mock.method(https,'request',(url,opts,receive)=>{
  assert.equal(opts.rejectUnauthorized,true);
  assert(Object.hasOwn(data,url),url);
  requests.push(url);
  const request=new EventEmitter();
  request.destroy=()=>{};
  request.end=()=>queueMicrotask(()=>{
   const {bytes,mime}=data[url];
   const response=new EventEmitter();
   Object.assign(response,{statusCode:200,complete:true,headers:{'content-type':mime,'content-length':String(bytes.length)}});
   receive(response);
   response.emit('data',bytes);
   response.emit('end');
  });
  return request;
 });
 await integration(t);
 assert.deepEqual(requests,[INDEX_URL,SOURCE_URL]);
});

test('timeout recovery: queue reuses CPython, chooses one bounded source retry across restart, and retains both original receipts',{skip:!rawFixtures||!masterPath||!pythonPath||cp==='--official-https',timeout:30000},async t=>{
 const trace=[];
 const data={
  [INDEX_URL]:{bytes:fs.readFileSync(path.join(rawFixtures,'index.html')),mime:'text/html'},
  [SOURCE_URL]:{bytes:fs.readFileSync(path.join(rawFixtures,'indot.pdf')),mime:'application/pdf'},
 };
 const originalTimeout=global.setTimeout;
 t.mock.method(global,'setTimeout',(callback,ms,...rest)=>originalTimeout(callback,ms===15000?15:ms,...rest));
 t.mock.method(https,'request',(url,opts,receive)=>{
  assert.equal(opts.rejectUnauthorized,true);assert(Object.hasOwn(data,url),url);
  trace.push(url);
  const stalled=trace.length===1,request=new EventEmitter();
  request.destroy=()=>{};
  request.end=()=>{if(!stalled)queueMicrotask(()=>{
   const {bytes,mime}=data[url],response=new EventEmitter();
   Object.assign(response,{statusCode:200,complete:true,headers:{'content-type':mime,'content-length':String(bytes.length)}});
   receive(response);response.emit('data',bytes);response.emit('end');
  });};
  return request;
 });
 await integration(t,{recover:true});
 assert.deepEqual(trace,[INDEX_URL,INDEX_URL,SOURCE_URL]);
});
