'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter,once}=require('node:events'),{createHash}=require('node:crypto');
const {start}=require('../research-preview/aec-instruction-preview.cjs');
const {createReceiptReviewRunner,openReceiptReview}=require('../research-preview/mission-selection-receipt-preview.cjs');
const {APPROVED_MISSION_SELECTION_COMMAND:command}=require('../research-preview/mission-selection-runner.cjs');
const {REPOSITORY,COMMIT}=require('../research-preview/cpython-source.cjs');
const {INDEX_URL,AREA_URL}=require('../research-preview/nasa-area-source.cjs');
const queueBytes=fs.readFileSync(path.resolve(__dirname,'../capability-registry/development-queue-v01.json'));
const masterPath=process.env.MANA_TEST_MASTER,nasaRaw=process.env.MANA_NASA_LESSON_RAW,cpyCaptures=process.env.MANA_SELECTION_CPYTHON;
const python=process.env.MANA_NASA_PYTHON??'/usr/bin/python3',sha=b=>createHash('sha256').update(b).digest('hex');
const hash='a'.repeat(64),nasaSha='ee6cfe639a6dee602af883fb1411fcb5a8a6e46f35be92421fa937ad69180cef';
const cpy=()=>({status:'AWAITING_HUMAN_REVIEW',missionId:'88ab05d456850cd0',sourceMode:'official-https',
 sourceUrl:'https://github.com/'+REPOSITORY+'/blob/'+COMMIT+'/Doc/library/math.rst',passed:16,total:16,
 candidate:hash,bridgeReceiptSha256:hash,captureSha256:hash,sourceProvenanceSha256:hash});
const nasa=()=>({status:'AWAITING_HUMAN_REVIEW',experimentId:'nasa-gross-planar-trapezoid-experiment-v1',sourceMode:'direct',
 transport:'DIRECT_OFFICIAL_HTTPS',reused:true,passed:16,total:16,testsRun:16,sourceUrl:AREA_URL,indexUrl:INDEX_URL,sourceSha256:nasaSha,
 indexSha256:hash,clauseSha256:hash,candidateSha256:hash,evidenceSha256:hash,freezeSha256:hash,gradeSha256:hash,
 modelCalls:0,modelTrainingPerformed:false,activationAuthorized:false,productionDeploymentAllowed:false});
const options=(readers={})=>({queueBytes,masterBytes:fs.readFileSync(masterPath),readCpython:cpy,readNasa:nasa,...readers});

test('review is explicit and pins the actual master before reading either receipt',()=>{
 const forbidden=()=>assert.fail('unauthorized receipt read');
 assert.throws(()=>createReceiptReviewRunner({queueBytes,masterBytes:Buffer.from('wrong'),readCpython:forbidden,readNasa:forbidden}),/MASTER_PIN/);
 assert.throws(()=>openReceiptReview({cpythonWorkspace:'relative',masterPath:'relative',nasaWorkspace:'relative',pythonPath:'relative'}),/ABSOLUTE_INPUTS/);
});

async function address(t,runner){
 const s=start({runner,missionSelection:true,receiptReview:true});await once(s,'listening');
 assert.equal(s.address().address,'127.0.0.1');
 const base='http://127.0.0.1:'+s.address().port;
 const close=()=>new Promise((resolve,reject)=>s.close(e=>e?reject(e):resolve()));
 t.after(()=>{if(s.listening)return close();});
 const html=await (await fetch(base)).text();
 const token=html.match(/'X-Mana-Token':'([0-9a-f]{64})'/)[1];
 const body=JSON.stringify({instruction:command}),headers={origin:base,'content-type':'application/json','X-Mana-Token':token};
 return {base,close,html,headers,body,go:()=>fetch(base+'/run',{method:'POST',headers,body}),history:()=>fetch(base+'/history')};
}
test('opt-in Persian page uses existing permission controls and shows receipt-only rendering',{skip:!masterPath},async t=>{
 let c=0,n=0;
 const runner=createReceiptReviewRunner(options({readCpython:()=>{c++;return cpy();},readNasa:()=>{n++;return nasa();}}));
 assert.equal(runner.run(command+' https://example.invalid').status,'REJECTED');assert.equal(c+n,0);
 const u=await address(t,runner);
 assert.match(u.html,/پیش‌نمایش فقط‌خواندنی/);assert.match(u.html,/برو جلو/);
 assert.equal((await fetch(u.base+'/run',{method:'POST',headers:{...u.headers,origin:'https://example.invalid'},body:u.body})).status,403);
 assert.equal((await fetch(u.base+'/run',{method:'POST',headers:{...u.headers,'X-Mana-Token':'0'.repeat(64)},body:u.body})).status,403);
 assert.equal((await fetch(u.base+'/approve')).status,404);assert.equal(c+n,0);
 const nodes={'#instruction':{value:command},'#status':{},'#details':{},'#progress':{},'#run':{}};
 vm.runInNewContext(u.html.split('<script>')[1].split('</script>')[0],{document:{querySelector:k=>nodes[k]},Intl,fetch:(p,o)=>fetch(u.base+p,o?.method==='POST'?{...o,headers:{...o.headers,origin:u.base}}:o)});
 await nodes['#run'].onclick();
 assert.match(nodes['#status'].textContent,/نیازمند بازبینی/);assert.match(nodes['#details'].textContent,/آزمون مستقل اجرای قبلی روی CPU: ۱۶ از ۱۶/);
 assert(nodes['#details'].textContent.includes(nasaSha));assert(nodes['#details'].textContent.includes(AREA_URL));assert.match(nodes['#details'].textContent,/دریافت تازه‌ای ندارد/);
 assert.match(nodes['#progress'].textContent,/۲ از ۲/);
 const h=await (await u.history()).json(),post=await (await u.go()).json();
 assert.deepEqual(h,post);assert.deepEqual(h.completed.map(x=>x.missionId),['88ab05d456850cd0','6d213a1b0d0b2a93']);
 assert.equal(h.missionId,'6d213a1b0d0b2a93');assert.equal(h.activationAuthorized,false);assert.equal(h.fullMissionComplete,false);
});
test('weak or unrelated prior results fail closed without substitute sources',{skip:!masterPath},()=>{
 for(const bad of [null,{status:'UNKNOWN'},{...cpy(),passed:15},{...cpy(),sourceMode:'pinned-replay'}]){
  const r=createReceiptReviewRunner(options({readCpython:()=>bad,readNasa:()=>assert.fail('first receipt not verified')}));
  assert.equal(r.history().status,'RECEIPT_UNVERIFIED');assert.equal(r.history().validatedCount,0);
 }
 for(const bad of [null,{status:'UNKNOWN_OUTCOME'},{...nasa(),sourceSha256:hash},{...nasa(),sourceMode:'pinned-capture'},
  {...nasa(),sourceUrl:'https://example.invalid/'},{...nasa(),passed:15},{...nasa(),activationAuthorized:true}]){
  const r=createReceiptReviewRunner(options({readNasa:()=>bad}));
  assert.equal(r.history().status,'RECEIPT_UNVERIFIED');assert.equal(r.history().validatedCount,1);assert.equal(r.history().sourceUrl,undefined);
 }
 assert.throws(()=>createReceiptReviewRunner(options({readNasa:()=>{throw Error('bad state');}})).history(),/bad state/);
});

test('recorded public fixtures verify on offline repeated clicks and restarts without any ledger mutation',
 {skip:!masterPath||!nasaRaw||!cpyCaptures||Number(process.versions.node.split('.')[0])<24},async t=>{
 const {createQueueResearchRunner,HOLDOUT_SHA256}=require('../research-preview/runner.cjs');
 const {createNasaAreaExperiment}=require('../research-preview/nasa-area-experiment.cjs');
 const {readerFromDirectory}=require('../research-preview/preview.cjs');
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'mana-offline-receipts-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const old=path.join(home,'prior-queue'),cpythonWorkspace=path.join(old,'research'),indot=path.join(old,'quantity'),nasaWorkspace=path.join(home,'prior-nasa');
 for(const d of [old,cpythonWorkspace,indot,nasaWorkspace])fs.mkdirSync(d,0o700);
 fs.writeFileSync(path.join(indot,'untouched'), 'unrelated evidence');
 const cp=createQueueResearchRunner({workspace:cpythonWorkspace,queueBytes,holdoutPath:path.resolve(__dirname,'../research-preview/holdout.json'),
  holdoutSha256:HOLDOUT_SHA256,sourceMode:'official-https',readOfficial:readerFromDirectory(cpyCaptures)});
 assert.equal((await cp.run()).status,'REVIEW_REQUIRED');
 const raw=fs.readFileSync(nasaRaw);assert.equal(sha(raw),nasaSha);
 const index=Buffer.from('<html><head><title>Index of Aerodynamics Slides</title></head><body><img alt="Label for Math Fundamentals"><a href="area.html">Area</a></body></html>');
 // Tests seed earlier receipts with the publisher lesson and a synthetic index behind injected HTTPS.
 const request=(url,opts,cb)=>{
  const q=new EventEmitter();q.destroy=()=>{};q.end=()=>setImmediate(()=>{
   const response=new EventEmitter();response.statusCode=200;response.headers={'content-type':'text/html'};response.complete=true;
   cb(response);response.emit('data',url===INDEX_URL?index:raw);response.emit('end');
  });return q;
 };
 const earlier=await createNasaAreaExperiment({workspace:nasaWorkspace,mode:'direct',pythonPath:python,request}).run();
 assert.equal(earlier.status,'AWAITING_HUMAN_REVIEW');
 function snapshot(root){
  const out={};for(const name of fs.readdirSync(root).sort()){
   const p=path.join(root,name),st=fs.lstatSync(p);
   out[name]=st.isDirectory()?snapshot(p):sha(fs.readFileSync(p));
  }return out;
 }
 const before=snapshot(home),config={cpythonWorkspace,masterPath,nasaWorkspace,pythonPath:python};
 let expected;
 for(let i=0;i<2;i++){
  const u=await address(t,openReceiptReview(config));
  for(const res of [await u.history(),await u.go(),await u.go()]){
   assert.equal(res.status,200);const result=await res.json();assert.equal(result.status,'AWAITING_HUMAN_REVIEW');
   assert.equal(result.sourceSha256,nasaSha);assert.equal(result.passed,16);
   expected??=result;assert.deepEqual(result,expected);
  }
  await u.close();assert.deepEqual(snapshot(home),before);
 }
 fs.appendFileSync(path.join(nasaWorkspace,'source.json'),' ');
 const v=await address(t,openReceiptReview(config));
 assert.equal((await v.history()).status,503);assert.equal((await v.go()).status,503);
});
