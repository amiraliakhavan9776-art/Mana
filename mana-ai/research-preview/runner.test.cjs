'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {once}=require('node:events');
const {createHash}=require('node:crypto');
const {startQueueResearchPreview,createQueueResearchRunner}=require('./runner.cjs');
const root='Doc/library/index.rst';
const queueBytes=fs.readFileSync(path.resolve(__dirname,'../capability-registry/development-queue-v01.json'));
const holdoutSha256='85fc8836e406a09356b2fb8455022f20e6625b1380d9260942bb497c9d41cb9b';
const capturesFile=process.env.MANA_CPYTHON_OFFICIAL_CAPTURES;
const oracle=path.join(__dirname,'holdout.json');
const sourceMode='pinned-replay';
function state(t){
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'mana-research-ui-'));
 t.after(()=>fs.rmSync(workspace,{recursive:true,force:true}));
 return workspace;
}
async function serve(config){
 const server=startQueueResearchPreview(config);await once(server,'listening');
 assert.equal(server.address().address,'127.0.0.1');
 return {base:'http://127.0.0.1:'+server.address().port,stop:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
async function page(base){
 const r=await fetch(base);assert.equal(r.status,200);assert.equal(r.headers.get('x-frame-options'),'DENY');
 const html=await r.text();assert.match(html,/<html lang="fa" dir="rtl"/);assert.match(html,/>برو جلو</);
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1], token=script.match(/'X-Mana-Token':'([0-9a-f]{64})'/)[1];
 const node=()=>({children:[],textContent:'',disabled:false,replaceChildren(){this.children=[]},append(x){this.children.push(x)}});
 const el=Object.fromEntries(['run','status','details','history'].map(k=>[k,node()]));
 const context=vm.createContext({document:{getElementById:k=>el[k],createElement:node},fetch:(url,config={})=>fetch(base+url,{...config,headers:{...config.headers,...(config.method==='POST'?{Origin:base}:{})}})});
 await vm.runInContext(script,context,{timeout:1000});
 return {el,token,click:()=>el.run.onclick()};
}
test('existing button selects actual queue mission but absent official root blocks synthesis and remains recorded',async t=>{
 const workspace=state(t), calls=[];
 const config={workspace,queueBytes,sourceMode,holdoutPath:path.join(os.tmpdir(),'unused-fma-holdout.json'),holdoutSha256,readOfficial:async p=>{calls.push(p);throw Error('OFFLINE');}};
 for(const run of [0,1]){
  const s=await serve(config);
  try{
   const p=await page(s.base);
   if(run===0){
    const bad=(Origin,key,body)=>fetch(s.base+'/run',{method:'POST',headers:{Origin,'X-Mana-Token':key},body});
    assert.equal((await bad('https://example.org',p.token)).status,403);
    assert.equal((await bad(s.base,'wrong')).status,403);
    assert.equal((await bad(s.base,p.token,'{}')).status,400);
    assert.equal((await fetch(s.base+'/mana')).status,404);
    assert.deepEqual(fs.readdirSync(workspace),[]);
   }
   await p.click();
   assert.match(p.el.status.textContent,/متوقف شد/);
   assert.match(p.el.details.textContent,/موتور پژوهش/);
   assert.match(p.el.details.textContent,/۸۴/);
   assert.match(p.el.details.textContent,/هیچ پیشنهادی ساخته نشد/);
   assert.equal(fs.existsSync(path.join(workspace,'worker')),false);
   if(run)assert.match(p.el.details.textContent,/رسید قبلی استفاده شد/);
   assert.deepEqual(calls,[root]);
  }finally{await s.stop();}
 }
});
test('official publisher evidence flows through Persian UI into isolated native worker, 16 heldouts, durable replay',{skip:!capturesFile},async t=>{
 assert.equal(createHash('sha256').update(fs.readFileSync(oracle)).digest('hex'),holdoutSha256);
 const workspace=state(t);
 const records=JSON.parse(fs.readFileSync(capturesFile)),calls=[];
 const config={workspace,queueBytes,sourceMode,holdoutPath:oracle,holdoutSha256,readOfficial:async p=>{calls.push(p);return records[p];}};
 let receipt;
 for(const run of [0,1]){
  const s=await serve(config);
  try{
   const p=await page(s.base); await p.click();
   assert.match(p.el.status.textContent,/نیازمند بازبینی/,p.el.details.textContent);
   assert.match(p.el.details.textContent,/۱۶ از ۱۶/);
   assert.match(p.el.details.textContent,/شیوهٔ خواندن منبع: بازپخش/);
   assert.match(p.el.details.textContent,/github\.com\/python\/cpython/);
   assert.match(p.el.details.textContent,/قابلیت فعال نشده/);
   assert.doesNotMatch(p.el.details.textContent,/\/tmp\/|\/workspace\//);
   assert.equal(calls.length,3);
   assert.deepEqual(calls,[root,'Doc/library/numeric.rst','Doc/library/math.rst']);
   assert.match(p.el.history.children[0].textContent,/نیازمند بازبینی/);
   const next=fs.readFileSync(path.join(workspace,'terminal.json'),'utf8');
   if(run){assert.match(p.el.details.textContent,/رسید قبلی استفاده شد/);assert.equal(next,receipt);}
   receipt=next;
  }finally{await s.stop();}
 }
 const frozen=JSON.parse(fs.readFileSync(path.join(workspace,'worker/learner/frozen.json'),'utf8'));
 assert.equal(frozen.candidateSha256,'3808634650e64a8d167daf6794265ce7a77c5d104fc16f3a41e649ec5a05d819');
 assert.equal(frozen.activationAuthorized,false);
});

test('terminal replay rejects missing or contradictory persisted provenance without retry or rewrite',{skip:!capturesFile},async t=>{
 const workspace=state(t),records=JSON.parse(fs.readFileSync(capturesFile)),calls=[];
 const config={workspace,queueBytes,sourceMode,holdoutPath:oracle,holdoutSha256,
  readOfficial:async p=>{calls.push(p);return records[p];}};
 assert.equal((await createQueueResearchRunner(config).run()).status,'REVIEW_REQUIRED');
 const terminal=path.join(workspace,'terminal.json');
 const proofFile=path.join(workspace,'source-provenance.json');
 const captureFile=path.join(workspace,'source-capture.json');
 const saved=fs.readFileSync(terminal);
 const proof=fs.readFileSync(proofFile),capture=fs.readFileSync(captureFile);
 const receipt=JSON.parse(saved).result;
 assert.equal(receipt.sourceProvenanceSha256,createHash('sha256').update(proof).digest('hex'));
 assert.equal(JSON.parse(proof).sourceMode,'pinned-replay');
 assert.equal(JSON.parse(proof).transport,'PINNED_LOCAL_REPLAY');
 for(const corrupt of [
  ()=>fs.unlinkSync(proofFile),
  ()=>fs.writeFileSync(proofFile,JSON.stringify({...JSON.parse(proof),transport:'OFFICIAL_CPYTHON_HTTPS'})),
  ()=>fs.writeFileSync(captureFile,JSON.stringify({...JSON.parse(capture),title:'other source'})),
 ]){
  fs.writeFileSync(proofFile,proof,{mode:0o600}); fs.writeFileSync(captureFile,capture);
  corrupt();
  const restarted=createQueueResearchRunner(config);
  await assert.rejects(restarted.run(),/SOURCE_(PROVENANCE|CAPTURE)_/);
  assert.throws(()=>restarted.history(),/SOURCE_(PROVENANCE|CAPTURE)_/);
  assert.deepEqual(fs.readFileSync(terminal),saved);
  assert.deepEqual(calls,[root,'Doc/library/numeric.rst','Doc/library/math.rst']);
 }
 fs.writeFileSync(proofFile,proof,{mode:0o600}); fs.writeFileSync(captureFile,capture);
 assert.equal((await createQueueResearchRunner(config).run()).reused,true);
});
