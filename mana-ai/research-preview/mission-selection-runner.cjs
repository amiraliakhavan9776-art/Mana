'use strict';
const {createHash}=require('node:crypto');
const {QUEUE_SHA256,RESEARCH_MISSION_ID,RESEARCH_SUBCASE_ID,selectResearchMission}=require('./queue.cjs');
const {APPROVED_PERSIAN_COMMAND,parsePersianResearchInstruction}=require('./persian-intake.cjs');
const {REPOSITORY,COMMIT}=require('./cpython-source.cjs');
const {ID:AEC_ID,SOURCE_URL:AEC_SOURCE}=require('./aec-source.cjs');
const {isDirectSourceFailure}=require('./aec-instruction-runner.cjs');

const APPROVED_MISSION_SELECTION_COMMAND='طبق سند توسعه ۱٫۱ از صف پژوهش یک مأموریت آماده انتخاب کن، منبع رسمی پیدا کن و پیشنهاد را با آزمون مستقل در محیط ایزوله بسنج؛ چیزی را فعال نکن.';
const POLICY='طبق سند توسعه 1.1 از صف پژوهش یک ماموریت آماده انتخاب کن منبع رسمی پیدا کن و پیشنهاد را با آزمون مستقل در محیط ایزوله بسنج چیزی را فعال نکن';
const AEC_MISSION_ID='6d213a1b0d0b2a93';
const TIMEOUT='INDOT_HTTPS_TIMEOUT';
const PY_SOURCE='https://github.com/'+REPOSITORY+'/blob/'+COMMIT+'/Doc/library/math.rst';
const LIMIT=768;
const SAFE=Object.freeze({activationAuthorized:false,productionDeploymentAllowed:false,modelTrainingPerformed:false,fullMissionComplete:false});
const hex=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const sha=x=>createHash('sha256').update(x).digest('hex');
const need=(ok,reason)=>{if(!ok)throw Error(reason);};

function supportsMissionSelectionInstruction(s){
 if(typeof s!=='string'||s.length===0||s.length>LIMIT||Buffer.byteLength(s)>LIMIT||/[^\p{Script=Arabic}\p{Mark}0-9 .،؛٫,;\t\u00a0\u200c]/u.test(s))return false;
 const normalized=s.normalize('NFC')
  .replace(/[۰-۹]/gu,c=>String(c.codePointAt(0)-0x06f0)).replace(/[٠-٩]/gu,c=>String(c.codePointAt(0)-0x0660))
  .replace(/ي/gu,'ی').replace(/ك/gu,'ک').replace(/أ/gu,'ا')
  .replace(/٫/gu,'.').replace(/[،؛,;\u200c]/gu,' ')
  .replace(/[.][ \t\u00a0]*$/u,'').replace(/[ \t\u00a0]+/gu,' ').trim();
 return normalized===POLICY;
}
const CASES=Object.freeze({
 [RESEARCH_MISSION_ID]:Object.freeze({caseId:RESEARCH_SUBCASE_ID,title:'موتور پژوهش: قاعدهٔ ضرب و جمع از مستند رسمی پایتون',section:'۳٫۵ و ۳٫۶',url:PY_SOURCE}),
 [AEC_MISSION_ID]:Object.freeze({caseId:AEC_ID,title:'مترهٔ سطح ناخالص قطعهٔ ذوزنقه‌ای',section:'۶٫۴',url:AEC_SOURCE}),
});
function verdict(row,spec,isPython){
 if(row===null)return null;
 need(row!==null&&typeof row==='object'&&!Array.isArray(row)&&row.missionId===spec.missionId,'CASE_RECEIPT_WRONG_MISSION');
 if(row.status===(isPython?'UNKNOWN':'UNKNOWN_OUTCOME'))return {status:'UNKNOWN_OUTCOME'};
 if(row.status===(isPython?'RESEARCH_BLOCKED':'SOURCE_BLOCKED')){
  if(!isPython&&row.sourceMode==='direct'){
   need(isDirectSourceFailure(row.sourceFailureCode),'CASE_RECEIPT_INVALID_DIRECT_FAILURE');
   return {status:'SOURCE_BLOCKED',sourceMode:'direct',sourceFailureCode:row.sourceFailureCode};
  }
  return {status:'SOURCE_BLOCKED'};
 }
 if(isPython&&row.status==='SYNTHESIS_BLOCKED'){
  need(row.sourceUrl===spec.url&&['host-mediated','pinned-replay','official-https'].includes(row.sourceMode)&&hex(row.sourceProvenanceSha256),'CASE_RECEIPT_INVALID_SOURCE');
  return {status:'TEST_NOT_PASSED',sourceUrl:row.sourceUrl,sourceMode:row.sourceMode};
 }
 const accepted=row.status==='AWAITING_HUMAN_REVIEW';
 need(accepted||row.status===(isPython?'TEST_FAILED':'TEST_NOT_PASSED'),'CASE_RECEIPT_STATUS_INVALID');
 need(row.sourceUrl===spec.url&&['host-mediated','pinned-replay',...(isPython?['official-https']:['direct'])].includes(row.sourceMode)&&hex(row.sourceSha256??row.sourceProvenanceSha256),'CASE_RECEIPT_INVALID_SOURCE');
 if(row.sourceMode==='direct')need(!isPython&&row.transport==='DIRECT_OFFICIAL_HTTPS'&&row.directRuntimeNetwork===true,'CASE_RECEIPT_INVALID_DIRECT_SOURCE');
 const candidateSha256=isPython?row.candidate:row.candidateSha256;
 const terminalProof=isPython?row.bridgeReceiptSha256:row.gradeSha256;
 const {passed,total}=row;
 const range=Number.isInteger(passed)&&Number.isInteger(total)&&total===16&&passed>=0&&passed<=total;
 need(range&&(!accepted||passed===total&&hex(candidateSha256)&&hex(terminalProof))&&(accepted||passed<total),'CASE_RECEIPT_INVALID_TEST_VERDICT');
 need(candidateSha256==null||hex(candidateSha256),'CASE_RECEIPT_INVALID_CANDIDATE');
 return {status:accepted?'AWAITING_HUMAN_REVIEW':'TEST_NOT_PASSED',sourceUrl:row.sourceUrl,sourceMode:row.sourceMode,passed,total,candidateSha256:candidateSha256??null};
}
/**
 * Trusted host adapters only. Read-only review/history must authenticate each
 * existing case's own local receipt; no browser input may supply adapters or state.
 */
function createMissionSelectionRunner({masterBytes,queueBytes,cpythonRunner,aecRunner}={}){
 const master=Buffer.isBuffer(masterBytes)&&masterBytes.length===76759?Buffer.from(masterBytes):null;
 const scope=parsePersianResearchInstruction(APPROVED_PERSIAN_COMMAND,{masterBytes:master});
 need(scope.status==='ACCEPTED','MASTER_PIN_MISMATCH');
 const pin=selectResearchMission(queueBytes);
 need(pin.status==='READY'&&pin.queueSha256===QUEUE_SHA256&&pin.master.documentSha256===scope.master.documentSha256,'QUEUE_PIN_MISMATCH');
 for(const section of [pin.master,pin.master.testSection])
  need(section&&sha(master.subarray(section.byteStart,section.byteEndExclusive))===section.sectionSha256,'MASTER_SECTION_PIN_MISMATCH');
 const queue=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(queueBytes));
 const ordered=queue.missions.filter(r=>Object.hasOwn(CASES,r.id)).map(r=>{
  const isPython=r.id===RESEARCH_MISSION_ID;
  const adapter=isPython?cpythonRunner:aecRunner,read=isPython?'review':'history';
  need(r.domain===(isPython?'Intelligence':'Technical office')&&r.state==='PENDING_REVIEW'&&r.productionDeploymentAllowed===false&&typeof adapter?.[read]==='function'&&typeof adapter.run==='function','CASE_ADAPTER_OR_QUEUE_INVALID');
  const withRetry=!isPython&&typeof adapter.retryHistory==='function'&&typeof adapter.retryTimeout==='function';
  return {...CASES[r.id],missionId:r.id,isPython,read:adapter[read].bind(adapter),run:adapter.run.bind(adapter),
   readRetry:withRetry?adapter.retryHistory.bind(adapter):null,retry:withRetry?adapter.retryTimeout.bind(adapter):null};

 });
 need(ordered.length===2&&ordered[0].isPython&&!ordered[1].isPython,'REVIEWED_QUEUE_ORDER_MISMATCH');
 function inspect(){
  const rows=ordered.map(spec=>({spec,result:verdict(spec.read(),spec,spec.isPython)}));
  const [cp,aec]=rows;
  const retry=aec.spec.readRetry?.();
  let retryAvailable=false,retryAttempted=false;
  if(retry){
   need(typeof retry.available==='boolean'&&typeof retry.attempted==='boolean'&&
    retry.attempted===(retry.result!==null)&&!(retry.available&&retry.attempted),'INVALID_RETRY_RECEIPT_VIEW');
   if(retry.available||retry.attempted){
    need(cp.result?.status==='AWAITING_HUMAN_REVIEW'&&aec.result?.status==='SOURCE_BLOCKED'&&
     aec.result.sourceMode==='direct'&&aec.result.sourceFailureCode===TIMEOUT,'RETRY_WITHOUT_ELIGIBLE_SEQUENCE');
    retryAvailable=retry.available;retryAttempted=retry.attempted;
    if(retry.attempted){
     const latest=verdict(retry.result,aec.spec,false);
     need(latest.status==='UNKNOWN_OUTCOME'||latest.sourceMode==='direct','RETRY_RECEIPT_NOT_DIRECT');
     aec.result=latest;
    }
   }
  }
  const incomplete=rows.findIndex(row=>row.result?.status!=='AWAITING_HUMAN_REVIEW');
  const count=incomplete<0?rows.length:incomplete;
  need(rows.slice(count+1).every(x=>x.result===null),'CASE_SEQUENCE_OR_RECEIPT_INVALID');
  return {rows,count,current:incomplete<0?null:rows[incomplete],retryAvailable,retryAttempted};
 }
 const info=(spec,result,progress,reused=false)=>({
  ...SAFE,caseId:spec.caseId,missionId:spec.missionId,title:spec.title,...result,
  sourceUrl:result.sourceUrl??null,sourceMode:result.sourceMode??null,
  passed:result.passed??null,total:result.total??null,candidateSha256:result.candidateSha256??null,
  retryAvailable:progress.retryAvailable,retryAttempted:progress.retryAttempted,
  recoveryAttempt:!spec.isPython&&progress.retryAttempted,
  previousFailureCode:!spec.isPython&&progress.retryAttempted?TIMEOUT:null,
  selectedBecause:!spec.isPython&&progress.retryAttempted
   ?result.status==='UNKNOWN_OUTCOME'
    ?'تنها تلاشِ بازیابی ثبت شده، اما نتیجهٔ آن هنوز تأیید نشده است. مانا آن را دوباره شروع نمی‌کند.'
    :'مانا پس از تأیید رسید قطع مهلت دریافتِ قبلی، تنها یک تلاش جداگانه برای خواندن همان منبع آغاز کرد. رسید تلاش اول محفوظ است.'
   :!spec.isPython&&progress.retryAvailable
    ?'مهلت دریافت منبع در تلاش اول تمام شد. این نتیجه ذخیره شد؛ دفعهٔ بعد مانا فقط یک بار همان دریافت را تکرار می‌کند.'
    :result.status==='UNKNOWN_OUTCOME'
   ?'رسید قطعی این مورد در دست نیست؛ مانا برای جلوگیری از اجرای تکراری به مورد بعد نمی‌رود.'
   :reused
    ?'رسید همین مورد بررسی شد. فقط قبولی آزمون مستقل اجازه می‌دهد مانا سراغ مورد بعد برود.'
    :'این ردیف در ترتیب صف اصلی، نخستین موردِ بازبینی‌شدهٔ بدون رسید قبولی است؛ '+
     (spec.isPython?'منشأ و تأیید شواهد در بندهای '+spec.section+' سند ۱٫۱ را می‌سنجد.':'مترهٔ محدودِ سطح را در بند '+spec.section+' سند ۱٫۱ می‌سنجد.'),
  reused,reviewedCount:ordered.length,validatedCount:progress.count,
  nextCaseId:progress.current?.result===null?progress.current.spec.caseId:null,
 });
 function noReady({rows,count,retryAttempted}){
  return {...SAFE,status:'NO_READY_CASE',caseId:null,missionId:null,title:'مورد آمادهٔ دیگری در این پیش‌نمایش نیست',
   selectedBecause:'هر دو آزمون بازبینی‌شده رسید قبولی دارند. مانا سراغ منبع یا مأموریت دیگری نمی‌رود؛ وضعیت صف ۸۴ ردیفی تغییر نکرده است.',
   sourceUrl:null,sourceMode:null,passed:null,total:null,candidateSha256:null,reused:true,
   reviewedCount:ordered.length,validatedCount:count,nextCaseId:null,retryAvailable:false,retryAttempted,previousFailureCode:retryAttempted?TIMEOUT:null,
   completed:rows.map(({spec,result})=>({caseId:spec.caseId,missionId:spec.missionId,title:spec.title,passed:result.passed,total:result.total})),
  };
 }
 let busy=false;
 return {
  history(){
   const p=inspect();
   if(!p.current)return noReady(p);
   if(p.current.result)return info(p.current.spec,p.current.result,p,true);
   if(!p.count)return null;
   const last=p.rows[p.count-1];return info(last.spec,last.result,p,true);
  },
  async run(instruction){
   if(!supportsMissionSelectionInstruction(instruction))return {...SAFE,status:'REJECTED',reasonCode:'UNSUPPORTED_INSTRUCTION'};
   if(busy)return {...SAFE,status:'UNKNOWN_OUTCOME',selectedBecause:'یک اجرای دیگر همین حالا در جریان است؛ درخواست تکراری آغاز نشد.'};
   busy=true;
   try{
    const before=inspect();
    if(!before.current)return noReady(before);
    const {spec,result}=before.current;
    if(result&&!before.retryAvailable)return info(spec,result,before,true);
    if(before.retryAvailable)await spec.retry(APPROVED_PERSIAN_COMMAND);
    else await (spec.isPython?spec.run():spec.run(APPROVED_PERSIAN_COMMAND));
    // A passing return value is never enough. Require the adapter's validated ledger.
    const after=inspect();
    const own=before.retryAvailable&&!after.retryAttempted?null:after.rows.find(x=>x.spec===spec).result;
    return info(spec,own??{status:'UNKNOWN_OUTCOME'},after);
   }finally{busy=false;}
  },
 };
}
module.exports={APPROVED_MISSION_SELECTION_COMMAND,createMissionSelectionRunner,supportsMissionSelectionInstruction};
