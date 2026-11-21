'use strict';
const {createHash}=require('node:crypto');

const QUEUE_SHA256='0b471e626fe8749de419c979fbbf3db0ab28268e0b6063cd67f812113bddba09';
const QUEUE_GIT_BLOB='f39e1d39c4469f97aabb65ff794816f399ececa9';
const QUEUE_COUNT=84;
const RESEARCH_MISSION_ID='88ab05d456850cd0';
const RESEARCH_SUBCASE_ID='official-source-synthesis-v1';
const MASTER=Object.freeze({
 version:'1.1',section:'3.5',
 documentSha256:'b9ce58b50834cbbeba50997998a937392bceba613905f611a99bf6df42277ce2',
 sectionSha256:'0a45b0876ad2e5e86d630b464c5f5f1bb487fdc87a386c110fb14418f0791d8e',
 byteStart:15409,byteEndExclusive:17233,
 testSection:Object.freeze({section:'3.6',sectionSha256:'2fce3af44cac0ca8f159be2210ba74eb389895ac471a61663904c61d9533c5ce',byteStart:17233,byteEndExclusive:19401}),
});
const SUPPORTED=Object.freeze({
 [RESEARCH_MISSION_ID]:Object.freeze({
  subcaseId:RESEARCH_SUBCASE_ID,
  expectedDomain:'Intelligence',expectedCapability:'Research Engine',
  reviewedScope:'یافتن مستند رسمی CPython ۳٫۱۳٫۵ از فهرست مستندات؛ استخراج شواهد math.fma، ساخت قاعده برای اعداد صحیحِ محدود و آزمون مستقل. نه اجرای API روی دادهٔ کاربر و نه ارزیابی کل موتور پژوهش.',
 }),
});
const WHY='از میان ۸۴ مأموریت ثبت‌شده، فقط یک آزمون محدود از مأموریت «موتور پژوهش» برای این اجرا بازبینی شده است. این آزمون بند ۳٫۵ سند ۱٫۱ را در مورد منشأ و تأیید شواهد، و بند ۳٫۶ را در مورد آزمون ایزوله می‌سنجد و هنوز نتیجهٔ معتبر ندارد.';
const COMPLETE_REASON='آزمون محدودِ بازبینی‌شده قبلاً نتیجهٔ معتبر دارد و دوباره اجرا نمی‌شود. وضعیت مأموریت اصلی و سایر ردیف‌های صف تغییر نکرده است.';
const need=(ok,reason)=>{if(!ok)throw Error(reason);};

/** Pure selection. validatedSubcaseIds may only come from a caller's validated local ledger, never an HTTP request. */
function selectResearchMission(queueBytes,validatedSubcaseIds=[]){
 need(Buffer.isBuffer(queueBytes)&&queueBytes.length>0&&queueBytes.length<=128*1024,'QUEUE_BYTES_REQUIRED');
 need(createHash('sha256').update(queueBytes).digest('hex')===QUEUE_SHA256,'QUEUE_PIN_MISMATCH');
 const doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(queueBytes));
 need(doc.schemaVersion==='0.1'&&Array.isArray(doc.missions)&&doc.missions.length===QUEUE_COUNT&&doc.automaticExecutionEnabled===false&&doc.automaticProductionDeployment===false,'QUEUE_SCHEMA_MISMATCH');
 const actual=new Set(doc.missions.map(m=>m.id));
 need(actual.size===QUEUE_COUNT&&actual.has(RESEARCH_MISSION_ID),'QUEUE_MISSIONS_MISMATCH');
 need(Array.isArray(validatedSubcaseIds)&&validatedSubcaseIds.length<=QUEUE_COUNT&&validatedSubcaseIds.every(s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(s)),'VALIDATED_SUBCASE_LIST_INVALID');
 const validated=new Set(validatedSubcaseIds);
 const reviewed=doc.missions.filter(m=>Object.hasOwn(SUPPORTED,m.id));
 need(reviewed.length===1,'REVIEWED_QUEUE_MAPPING_MISMATCH');
 for(const m of reviewed){
  const spec=SUPPORTED[m.id];
  need(m.domain===spec.expectedDomain&&m.capability===spec.expectedCapability&&m.state==='PENDING_REVIEW'&&m.sourceStatus==='نمونه اولیه'&&Array.isArray(m.acceptanceEvidence)&&m.acceptanceEvidence.length===0&&m.productionDeploymentAllowed===false,'SOURCE_MISSION_STATUS_MISMATCH');
 }
 const item=reviewed.find(m=>!validated.has(SUPPORTED[m.id].subcaseId));
 const mission=item?{
  id:item.id,domain:item.domain,capability:item.capability,state:item.state,sourceStatus:item.sourceStatus,
  productionDeploymentAllowed:false,
 }:null;
 return {
  status:mission?'READY':'NO_SUPPORTED_UNVALIDATED_SUBCASE',
  queueCount:doc.missions.length,queueSha256:QUEUE_SHA256,queueGitBlob:QUEUE_GIT_BLOB,
  reviewedScopeCount:reviewed.length,
  remainingUncoveredCount:doc.missions.length-reviewed.length,
  mission,subcaseId:RESEARCH_SUBCASE_ID,
  selectionReason:mission?WHY:COMPLETE_REASON,
  reviewedScope:SUPPORTED[RESEARCH_MISSION_ID].reviewedScope,
  master:{...MASTER},fullMissionComplete:false,activationAuthorized:false,
 };
}
module.exports={selectResearchMission,QUEUE_SHA256,QUEUE_GIT_BLOB,RESEARCH_MISSION_ID,RESEARCH_SUBCASE_ID};
