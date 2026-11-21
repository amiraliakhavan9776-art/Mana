'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {selectResearchMission} = require('./queue.cjs');
const {createReceiptStore} = require('./receipt.cjs');
const {researchFma} = require('./cpython-source.cjs');
const run = promisify(execFile);
const sha=b=>createHash('sha256').update(b).digest('hex');
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const need=(ok,why)=>{if(!ok)throw Error(why);};

const bridgePath=path.resolve(__dirname,'./bridge.cjs');
const HOLDOUT_SHA256='85fc8836e406a09356b2fb8455022f20e6625b1380d9260942bb497c9d41cb9b';
const TESTED=new Set(['AWAITING_HUMAN_REVIEW','TEST_FAILED']);
const TITLE='موتور پژوهش: یافتن مستند رسمی و ساخت یک قاعدهٔ قابل‌آزمون';
function display(selection,result,reused=false){
 const status=result?.status;
 const tested=TESTED.has(status);
 const reason={
   AWAITING_HUMAN_REVIEW:'این آزمون محدود قبول شد و برای بازبینی ثبت شد؛ قابلیت فعال نشده است.',
   TEST_FAILED:'پیشنهاد همهٔ آزمون‌های مستقل را نگذراند؛ قابلیت فعال نشده است.',
   RESEARCH_BLOCKED:'مسیر مستند رسمی یا رابطهٔ مورد انتظار قابل تأیید نبود. هیچ پیشنهادی ساخته نشد.',
   UNKNOWN:'اجرای قبلی رسید کامل ندارد؛ برای جلوگیری از دوباره‌کاری خودکار متوقف شد.',
   SYNTHESIS_BLOCKED:'سند پیدا شد ولی ساخت یا آزمون ایزوله به نتیجهٔ قابل‌تأیید نرسید.',
 }[status];
 need(reason,'UNKNOWN_PREVIEW_STATUS');
 const output=['بند ۳٫۵ سند ۱٫۱؛ یک آزمون محدود از ۸۴ ردیف صف، نه تکمیل موتور پژوهش.'];
 if(result.sourceUrl){
  output.push('سند رسمی CPython نسخهٔ ۳٫۱۳٫۵:',result.sourceUrl,'شیوهٔ خواندن منبع: '+(result.sourceMode==='pinned-replay'?'بازپخش نسخهٔ پین‌شده، نه جست‌وجوی زنده.':result.sourceMode==='official-https'?'دریافت محدود از ناشر روی HTTPS.':'دریافت با رابط میزبان؛ نه دسترسی مستقل به شبکه.'));
 }
 if(tested){
  const fa=n=>new Intl.NumberFormat('fa-IR',{useGrouping:false}).format(n);
  output.push('آزمون مستقل روی CPU: '+fa(result.passed)+' از '+fa(result.total),'شناسهٔ پیشنهاد: '+result.candidate);
 }
 return {status:tested?'REVIEW_REQUIRED':'EXECUTION_BLOCKED',mission:{title:TITLE,id:selection.mission?.id??null},selectedBecause:selection.selectionReason,reason,output:output.join('\n'),reused};
}
function createQueueResearchRunner({queueBytes,workspace,holdoutPath,holdoutSha256,sourceMode,readOfficial}={}){
 need(Buffer.isBuffer(queueBytes)&&queueBytes.length<=128*1024,'QUEUE_BYTES_REQUIRED');
 const queue=Buffer.from(queueBytes);
 const initial=selectResearchMission(queue);
 need(initial.status==='READY'&&['pinned-replay','host-mediated','official-https'].includes(sourceMode)&&typeof readOfficial==='function','REVIEWED_REPLAY_REQUIRED');
 need(typeof holdoutPath==='string'&&path.isAbsolute(holdoutPath)&&path.resolve(holdoutPath)===holdoutPath&&holdoutSha256===HOLDOUT_SHA256,'PINNED_ORACLE_REQUIRED');
 need(holdoutPath!==workspace&&!holdoutPath.startsWith(workspace+path.sep),'ORACLE_MUST_BE_OUTSIDE_STATE');
 const bridge=require(bridgePath);
 const store=createReceiptStore({workspace,slot:{id:initial.subcaseId,schema:'MANA_QUEUE_RESEARCH_V1',queue:initial.queueSha256,scope:initial.subcaseId,mission:initial.mission.id,holdoutSha256,sourceMode}});
 const sourcePath=path.join(workspace,'source-capture.json');
 const workerWorkspace=path.join(workspace,'worker');
 function validateTested(result){
  if(!TESTED.has(result.status))return;
  need(result.sourceMode===sourceMode&&hex(result.captureSha256)&&hex(result.bridgeReceiptSha256)&&hex(result.candidate),'MISSING_WORKER_LINK');
  const restored=bridge.readFmaMissionHistory({workspace:workerWorkspace,sourcePath,sourceSha256:result.captureSha256,holdoutPath,holdoutSha256});
  need(Array.isArray(restored)&&restored.length===1&&restored[0].status===result.status&&restored[0].heldoutPassed===result.passed&&restored[0].heldoutTotal===result.total&&restored[0].bridgeReceiptSha256===result.bridgeReceiptSha256&&restored[0].candidateSha256===result.candidate,'WORKER_RECEIPT_MISMATCH');
 }
 function renderSaved(result){
  validateTested(result);
  const selection=selectResearchMission(queue,result.status==='AWAITING_HUMAN_REVIEW'?[initial.subcaseId]:[]);
  return display({...selection,mission:initial.mission},result,true);
 }
 return {
  history(){
   const record=store.read();
   if(record.state==='EMPTY')return [];
   const view=record.state==='TERMINAL'?renderSaved(record.result):display(initial,{status:'UNKNOWN'});
   return [{...view.mission,status:view.status}];
  },
  async run(){
   const ticket=store.claim();
   if(ticket.state==='TERMINAL')return renderSaved(ticket.result);
   if(ticket.state!=='CLAIMED')return display(initial,{status:'UNKNOWN'});
   const done=result=>{ticket.commit(result);return display(initial,result);};
   let evidence;
   try{evidence=await researchFma({readOfficial});}
   catch{return done({status:'RESEARCH_BLOCKED'});}
   if(evidence?.status!=='OFFICIAL_SOURCE_VERIFIED'||!evidence.legacyCapture||!evidence.source)return done({status:'RESEARCH_BLOCKED'});
   const b=Buffer.from(JSON.stringify(evidence.legacyCapture)+'\n');
   const captureSha256=sha(b);
   // This is a cross-reference; it is not a claim to have fetched the rendered docs site.
   const sourceUrl=evidence.source.captures.at(-1).url;
   const f=fs.openSync(sourcePath,'wx',0o600);
   try{fs.writeFileSync(f,b);fs.fsyncSync(f);}finally{fs.closeSync(f);}
   const proof=fs.openSync(path.join(workspace,'source-provenance.json'),'wx',0o600);
   try{fs.writeFileSync(proof,JSON.stringify(evidence.source)+'\n');fs.fsyncSync(proof);}finally{fs.closeSync(proof);}
   fs.mkdirSync(workerWorkspace,0o700);
   let result;
   try{const {stdout}=await run(process.execPath,[bridgePath,workerWorkspace,sourcePath,captureSha256,holdoutPath,holdoutSha256],{timeout:22000,maxBuffer:32000,env:{},windowsHide:true});result=JSON.parse(stdout);}
   catch{return done({status:'SYNTHESIS_BLOCKED',sourceUrl,sourceMode});}
   if(!TESTED.has(result.status))return done({status:'SYNTHESIS_BLOCKED',sourceUrl,sourceMode});
   const verdict={status:result.status,captureSha256,sourceUrl,sourceMode,passed:result.heldoutPassed,total:result.heldoutTotal,candidate:result.candidateSha256,bridgeReceiptSha256:result.bridgeReceiptSha256};
   validateTested(verdict);
   return done(verdict);
  },
 };
}
function startQueueResearchPreview({port=0, ...opts}={}){
 const runner=createQueueResearchRunner(opts);
 const {start}=require('../development-ui.cjs');
 const server=start({port,runner});
 const [handle]=server.listeners('request');
 if(typeof handle!=='function'||server.listenerCount('request')!==1){server.close();throw Error('Unexpected interface request handler');}
 server.off('request',handle);
 server.on('request',(req,res)=>{
  if((req.method==='GET'&&(req.url==='/'||req.url==='/history'))||(req.method==='POST'&&req.url==='/run'))return handle.call(server,req,res);
  res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end('این مسیر در پیش‌نمایش فعال نیست.');
 });
 return server;
}
module.exports={createQueueResearchRunner,startQueueResearchPreview,HOLDOUT_SHA256};
