'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {once}=require('node:events'),vm=require('node:vm');
const {start}=require('../research-preview/aec-instruction-preview.cjs');
const {APPROVED_MISSION_SELECTION_COMMAND}=require('../research-preview/mission-selection-runner.cjs');

test('Persian preview shows one recovery decision using the original action, never replays in history',async t=>{
 const trace=[];
 const title='مترهٔ سطح ناخالص قطعهٔ ذوزنقه‌ای';
 const runner={
  history(){trace.push('history');return {status:'SOURCE_BLOCKED',title,sourceFailureCode:'INDOT_HTTPS_TIMEOUT',retryAvailable:true,validatedCount:1,reviewedCount:2};},
  run(instruction){trace.push(instruction);return {status:'AWAITING_HUMAN_REVIEW',title,recoveryAttempt:true,passed:16,total:16,validatedCount:2,reviewedCount:2};},
 };
 const server=start({runner,missionSelection:true});
 await once(server,'listening');
 t.after(()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
 const base='http://127.0.0.1:'+server.address().port;
 const page=await(await fetch(base)).text();
 assert.match(page,/>برو جلو</);
 assert.equal((await fetch(base+'/retry',{method:'POST'})).status,404);
 const el={'#instruction':{value:APPROVED_MISSION_SELECTION_COMMAND},'#status':{},'#details':{},'#progress':{},'#run':{}};
 let ready;
 const history=new Promise(resolve=>ready=resolve);
 vm.runInNewContext(page.split('<script>')[1].split('</script>')[0],{
  document:{querySelector:id=>el[id]},Intl,
  fetch:async (part,opts)=>{
   const r=await fetch(base+part,opts?.method==='POST'?{...opts,headers:{...opts.headers,origin:base}}:opts);
   if(part==='/history')return {ok:r.ok,json:async()=>{const data=await r.json();setImmediate(ready);return data;}};
   return r;
  },
 });
 await history;
 assert.deepEqual(trace,['history']);
 assert.match(el['#details'].textContent,/مانا در اجرای بعدی خودش فقط همین دریافت را یک‌بار تکرار می‌کند/);
 await el['#run'].onclick();
 assert.deepEqual(trace,['history',APPROVED_MISSION_SELECTION_COMMAND]);
 assert.match(el['#details'].textContent,/تلاش دوبارهٔ مانا/);
 assert.match(el['#details'].textContent,/۱۶ از ۱۶/);
});
