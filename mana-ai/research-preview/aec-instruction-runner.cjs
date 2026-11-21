'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {createReceiptStore}=require('./receipt.cjs');
const {QUEUE_SHA256}=require('./queue.cjs');
const {APPROVED_PERSIAN_COMMAND,parsePersianResearchInstruction}=require('./persian-intake.cjs');

const sha=b=>createHash('sha256').update(b).digest('hex');
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const missionId='6d213a1b0d0b2a93',subcase='trapezoid-panel-area-twice-mm2';
const title='مترهٔ سطح ناخالص قطعهٔ ذوزنقه‌ای';
const reason='از بند ۶٫۴ و صف ۸۴ ردیفی، این آزمون محدودِ متره برای پژوهش بازبینی شده و در این محیط هنوز رسید ندارد.';
const DIRECT_TRANSPORT='DIRECT_OFFICIAL_HTTPS';
const DIRECT_FAILURES=Object.freeze({
 INDOT_HTTPS_TIMEOUT:'INDOT_HTTPS_TIMEOUT',
 INDOT_HTTPS_REQUEST_FAILED:'INDOT_HTTPS_REQUEST_FAILED',
 INDOT_HTTPS_STATUS_REJECTED:'INDOT_HTTPS_STATUS_REJECTED',
 INDOT_HTTPS_INCOMPLETE:'INDOT_HTTPS_INCOMPLETE',
 INDOT_LINK_NOT_APPROVED:'INDOT_LINK_NOT_APPROVED',
 INDOT_LINK_MISSING_OR_AMBIGUOUS:'INDOT_LINK_MISSING_OR_AMBIGUOUS',
 INDOT_PDF_REVISION_MISMATCH:'INDOT_PDF_REVISION_MISMATCH',
 INDOT_PYMUPDF_REQUIRED:'INDOT_PYMUPDF_REQUIRED',
 INDOT_EXTRACTOR_TIMEOUT:'INDOT_EXTRACTOR_TIMEOUT',
 INDOT_EXTRACTOR_START_FAILED:'INDOT_EXTRACTOR_START_FAILED',
 INDOT_EXTRACTOR_FAILED:'INDOT_EXTRACTOR_FAILED',
 INDOT_SOURCE_UNVERIFIED:'INDOT_SOURCE_UNVERIFIED',
});
const isDirectSourceFailure=s=>typeof s==='string'&&Object.hasOwn(DIRECT_FAILURES,s);
const safety={activationAuthorized:false,productionDeploymentAllowed:false,modelTrainingPerformed:false};
const need=(ok,code)=>{if(!ok)throw Error(code);};
function readBound(file,max){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{
  const st=fs.fstatSync(fd);need(st.isFile()&&st.size>0&&st.size<=max,'FILE_REJECTED');
  const b=Buffer.alloc(st.size+1);let n=0;
  while(n<b.length){const k=fs.readSync(fd,b,n,b.length-n,null);if(!k)break;n+=k;}
  need(n===st.size,'FILE_CHANGED');return b.subarray(0,n);
 }finally{fs.closeSync(fd);}
}
const decode=b=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
function createAecInstructionRunner({workspace,masterBytes,queueBytes,discover,learn,readLearning,sourceMode}){
 need(Buffer.isBuffer(queueBytes)&&queueBytes.length<128*1024&&sha(queueBytes)===QUEUE_SHA256,'QUEUE_PIN_MISMATCH');
 const queue=decode(queueBytes);
 need(queue.missions.length===84&&queue.automaticExecutionEnabled===false&&queue.automaticProductionDeployment===false,'QUEUE_INVALID');
 const m=queue.missions.find(i=>i.id===missionId);
 need(m?.domain==='Technical office'&&m.state==='PENDING_REVIEW'&&m.productionDeploymentAllowed===false,'MISSION_INVALID');
 const master=Buffer.isBuffer(masterBytes)?Buffer.from(masterBytes):null;
 const policy=parsePersianResearchInstruction(APPROVED_PERSIAN_COMMAND,{masterBytes:master});
 need(policy.status==='ACCEPTED','MASTER_PIN_MISMATCH');
 need(['pinned-replay','host-mediated','direct'].includes(sourceMode)&&[discover,learn,readLearning].every(f=>typeof f==='function'),'LANE_CONFIG_INVALID');
 const store=createReceiptStore({workspace,slot:{id:subcase,schema:'MANA_AEC_INSTRUCTION_V1',missionId,queue:QUEUE_SHA256,documentSha256:policy.master.documentSha256,sectionSha256:policy.master.sectionSha256,instructionSha256:policy.instructionSha256,sourceMode}});
 const sourceFile=path.join(workspace,'source.json'),learner=path.join(workspace,'learner');
 function render(result,reused=false){
  return {...result,missionId,title,selectedBecause:reused?'رسید معتبر قبلی برای همین مأموریت ثبت شده است.':reason,sourceMode,reused,...safety};
 }
 function learningView(g){
  const accepted=g?.status==='AWAITING_HUMAN_REVIEW';
  need(g&&g.activationAuthorized===false&&hex(g.freezeSha256),'INVALID_LEARNER_RESULT');
  const passed=g.passed??null,total=g.total??null,candidateSha256=g.candidateSha256??null;
  need(!accepted||(Number.isInteger(total)&&total>=8&&passed===total&&hex(candidateSha256)&&hex(g.gradeSha256)),'INVALID_TEST_PASS');
  return {status:accepted?'AWAITING_HUMAN_REVIEW':'TEST_NOT_PASSED',learnerStatus:g.status,passed,total,candidateSha256,freezeSha256:g.freezeSha256,gradeSha256:g.gradeSha256??null};
 }
 function checkedEvidence(e){
  const {INDEX_URL,SOURCE_URL}=require('./aec-source.cjs');
  need(e?.status==='OFFICIAL_SOURCE_VERIFIED'&&e.sourceUrl===SOURCE_URL&&hex(e.sourceSha256)&&e.evidence?.sourceMode===sourceMode&&e.evidence.source?.sha256===e.sourceSha256&&e.fit?.id===subcase,'SOURCE_EVIDENCE_NOT_VERIFIED');
  if(sourceMode==='direct'){
   const proof=e.evidence,{PDF_SHA256,PDF_BYTES}=require('./indot-direct.cjs');
   const capture=v=>v&&hex(v.sha256)&&Number.isSafeInteger(v.byteCount)&&v.byteCount>0&&
    typeof v.retrievedAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.retrievedAt)&&Number.isFinite(Date.parse(v.retrievedAt));
   const link=proof.link,passage=proof.passage;
   need(proof.transport===DIRECT_TRANSPORT&&proof.directRuntimeNetwork===true&&proof.captureRepresentation==='AUTHENTICATED_RAW_HTML_AND_PDF'&&
    capture(proof.index)&&proof.index.url===INDEX_URL&&capture(proof.source)&&proof.source.url===SOURCE_URL&&proof.source.byteCount===PDF_BYTES&&hex(PDF_SHA256)&&e.sourceSha256===PDF_SHA256&&
    link&&link.url===SOURCE_URL&&typeof link.href==='string'&&link.href.length<2048&&new URL(link.href,INDEX_URL).href===SOURCE_URL&&hex(link.sha256)&&
    passage?.pageIndex===12&&hex(passage.sha256)&&hex(passage.structureSha256)&&hex(passage.proseSha256),
    'DIRECT_SOURCE_PROVENANCE_NOT_VERIFIED');
  }
  return e;
 }
 const sourceTransport=e=>sourceMode==='direct'?{transport:e.evidence.transport,directRuntimeNetwork:e.evidence.directRuntimeNetwork}:{};
 function restore(r){
  if(r.status==='SOURCE_BLOCKED'){
   need(!fs.existsSync(sourceFile)&&!fs.existsSync(learner),'UNEXPECTED_EVIDENCE');
   if(sourceMode==='direct')need(isDirectSourceFailure(r.sourceFailureCode),'INVALID_DIRECT_SOURCE_FAILURE');
  }else{
   need(hex(r.evidenceSha256),'RECEIPT_EVIDENCE_MISSING');
   const b=readBound(sourceFile,64*1024);
   need(sha(b)===r.evidenceSha256,'RECEIPT_EVIDENCE_CHANGED');
   const e=checkedEvidence(decode(b));
   const g=learningView(readLearning({workspace:learner,fit:e.fit,evidenceSha256:r.evidenceSha256}));
   need(e.sourceUrl===r.sourceUrl&&e.sourceSha256===r.sourceSha256&&Object.entries({...g,...sourceTransport(e)}).every(([k,v])=>r[k]===v),'LEARNER_RECEIPT_CHANGED');
  }
  return render(r,true);
 }
 return {
  history(){
   const v=store.read();
   return v.state==='EMPTY'?null:v.state==='TERMINAL'?restore(v.result):render({status:'UNKNOWN_OUTCOME'});
  },
  async run(instruction){
   const accepted=parsePersianResearchInstruction(instruction,{masterBytes:master});
   if(accepted.status!=='ACCEPTED')return {status:'REJECTED',reasonCode:accepted.reasonCode,...safety};
   const ticket=store.claim();
   if(ticket.state==='TERMINAL')return restore(ticket.result);
   if(ticket.state!=='CLAIMED')return render({status:'UNKNOWN_OUTCOME'});
   let e;
   try{e=checkedEvidence(await discover());}catch(error){
    const r={status:'SOURCE_BLOCKED',...(sourceMode==='direct'?{sourceFailureCode:isDirectSourceFailure(error?.message)?error.message:'INDOT_SOURCE_UNVERIFIED'}:{})};
    ticket.commit(r);return render(r);
   }
   const b=Buffer.from(JSON.stringify(e)+'\n'),evidenceSha256=sha(b);
   need(b.length<=64*1024,'SOURCE_EVIDENCE_LIMIT');
   const fd=fs.openSync(sourceFile,'wx',0o600);
   try{fs.writeFileSync(fd,b);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   fs.mkdirSync(learner,0o700);
   const g=await learn({workspace:learner,fit:e.fit,evidenceSha256});
   const r={...learningView(g),...sourceTransport(e),sourceUrl:e.sourceUrl,sourceSha256:e.sourceSha256,evidenceSha256};
   // Re-read and verify before committing the terminal verdict, not just on replay.
   restore(r);ticket.commit(r);return render(r);
  },
 };
}
module.exports={createAecInstructionRunner,readBound,isDirectSourceFailure};
