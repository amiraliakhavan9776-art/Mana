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
async function integration(t){

 assert(masterPath&&pythonPath,'Private master and approved Python runtime required for live opt-in');
 const {openMissionSelection}=require('../research-preview/mission-selection-preview.cjs');
 const workspace=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mana-direct-indot-ui-')));
 t.after(()=>fs.rmSync(workspace,{recursive:true,force:true}));
 let current;
 async function launch(){
  current=start({missionSelection:true,runner:openMissionSelection({workspace,masterPath,cpythonSource:cp,pythonPath})});
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
 let u=await launch();
 const first=await u.run();
 assert.equal(first.status,'AWAITING_HUMAN_REVIEW',JSON.stringify(first));
 assert.equal(first.missionId,'88ab05d456850cd0');assert.equal(first.passed,16);
 const second=await u.run();
 assert.equal(second.status,'AWAITING_HUMAN_REVIEW',JSON.stringify(second));
 assert.equal(second.missionId,'6d213a1b0d0b2a93');assert.equal(second.sourceMode,'direct');
 assert.equal(second.passed,16);assert.equal(second.total,16);assert.equal(second.activationAuthorized,false);
 const artifact=JSON.parse(fs.readFileSync(path.join(workspace,'quantity','source.json'),'utf8'));
 assert.equal(artifact.evidence.directRuntimeNetwork,true);
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
