'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('../src/server.cjs'),{createNativeCore}=require('../src/native/core.cjs');
const TOKEN='native-api-test-token-with-more-than-32-characters';
const core=createNativeCore({capabilities:[{id:'draft',title:'پیش‌نویس',requires:['source'],produces:['ready'],workUnits:1,risk:'draft'}]});
const fact=(id,key,value)=>({id,orgId:'org',projectId:'p',key,value,source:'synthetic',verification:'verified'});
async function withServer(run,{evidence=[fact('e1','source',true),fact('e2','a:quality',8)],audit,enabled=true}={}){
 const server=createServer({token:TOKEN,principals:[{id:'u',orgId:'org',role:'analyst',token:TOKEN,projectIds:['p'],capabilityIds:['draft']}],projects:[{id:'p',orgId:'org',name:'One'},{id:'hidden',orgId:'org',name:'Hidden'}],nativeCore:enabled?core:null,nativeEvidence:evidence,...(audit?{audit}:{})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await run('http://127.0.0.1:'+server.address().port)}finally{await new Promise(resolve=>server.close(resolve))}
}
const post=(base,route,body,auth=true)=>fetch(base+'/v1/native/'+route,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+TOKEN}:{})},body:JSON.stringify(body)});
const plan={projectId:'p',objective:'گزارش',goals:['ready']};
test('native HTTP plans and evaluations use authenticated scopes and server-side evidence',()=>withServer(async base=>{
 assert.equal((await post(base,'plan',plan,false)).status,401);
 const response=await post(base,'plan',plan);assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.status,'PLAN_PROPOSED');assert.equal(result.actionsExecuted,0);assert.equal(result.wbs.length,1);
 const evaluation=await post(base,'evaluate',{projectId:'p',criteria:[{id:'quality',weight:1,direction:'maximize',min:0,max:10}],alternatives:[{id:'a',label:'candidate',assessments:[{criterionId:'quality',value:8,evidenceIds:['e2']}]}]});
 assert.equal(evaluation.status,200);assert.equal((await evaluation.json()).recommendedId,'a');
 assert.equal((await post(base,'plan',{...plan,projectId:'hidden'})).status,404);
 assert.equal((await post(base,'plan',{...plan,evidence:[fact('fake','ready',true)]})).status,400);
 const capability=await fetch(base+'/v1/capabilities',{headers:{authorization:'Bearer '+TOKEN}});
 assert.equal((await capability.json()).nativeCoreEnabled,true);
}));
test('evidence is snapshotted and clients cannot promote an unverified fact',async()=>{
 const evidence=[fact('e1','source',false)];
 await withServer(async base=>{
  evidence[0].value=true;
  assert.equal((await (await post(base,'plan',plan)).json()).status,'NO_PLAN_WITHIN_CONSTRAINTS');
  assert.equal((await post(base,'plan',{...plan,capabilityIds:['draft']})).status,400);
 },{evidence});
});
test('native HTTP size/content/audit failures do not disclose results and core is disabled by default',async()=>{
 await withServer(async base=>{
  assert.equal((await post(base,'plan',{...plan,objective:'x'.repeat(40000)})).status,413);
  assert.equal((await fetch(base+'/v1/native/plan',{method:'POST',headers:{authorization:'Bearer '+TOKEN},body:'{}'})).status,415);
 });
 await withServer(async base=>{
  const response=await post(base,'plan',plan);assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'audit_unavailable'});
 },{audit:{record(){throw Error('disk full')},list(){return []}}});
 await withServer(async base=>assert.equal((await post(base,'plan',plan)).status,405),{enabled:false});
});
