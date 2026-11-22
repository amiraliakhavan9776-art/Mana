'use strict';
// Observations come only from already verified receipts in the trusted host.
// This policy cannot authenticate receipts; it never parses arbitrary text or acts.
const {createHash}=require('node:crypto');
const SCHEMA='MANA_EVIDENCE_IMPROVEMENT_IDEAS_V1';
const INPUT='MANA_REVIEWED_EVIDENCE_SNAPSHOT_V1';
const HEX=/^[0-9a-f]{64}$/;
const MAX_EVIDENCE=32,MAX_PRIOR=128,MAX_SAMPLES=10000;
const familyOutcomes=Object.freeze({
 'source-verification':Object.freeze(['VERIFIED','SOURCE_UNREACHABLE','SOURCE_SCOPE_MISMATCH']),
 'receipt-recovery':Object.freeze(['VERIFIED','UNKNOWN_AFTER_INTERRUPT','REPLAY_RECEIPT_MISMATCH']),
 'jarvis-availability':Object.freeze(['VERIFIED','NO_COMMON_AVAILABILITY','WRONG_AVAILABILITY']),
 'campaign-coverage':Object.freeze(['VERIFIED_COMPLETE_NO_FRESH_CASE']),
});
const rules=Object.freeze({
 'campaign-coverage/VERIFIED_COMPLETE_NO_FRESH_CASE':Object.freeze({
  assessment:'CONFIRMED_OPPORTUNITY',priority:1,topic:'add-one-reviewed-unseen-benign-case',
  title:'یک آزمون تازه اضافه شود تا فقط نمونهٔ قبلی تکرار نشود',
  reason:'اجرای بازبینی‌شده دست‌کم یک نتیجهٔ موفق دارد و در همین دامنه، مورد تازهٔ آماده‌ای باقی نمانده است؛ این به معنی تکمیل کل صف نیست.',
  testId:'one-independent-unseen-case-and-restart',
  test:'برای یک نمونهٔ ساختگی و بی‌خطرِ تازه، پیش از اجرا جواب مرجع را جدا ثبت کن. در اجرای آزمایشی بعد، مانا آن را انتخاب کند، آزمون مستقل را بگذراند و بعد از شروع مجدد همان رسید را بدون اجرای دوم نشان دهد.',
 }),
 'source-verification/SOURCE_UNREACHABLE':Object.freeze({
  priority:2,topic:'label-source-read-boundary',
  title:'جدا کردن مرحلهٔ نرسیدن مدرک از نتیجهٔ بررسی منبع',
  reason:'دریافت مدرک در نمونه‌های ثبت‌شده کامل نشد. این شاهد به‌تنهایی علت قطع یا نبودن محتوا را مشخص نمی‌کند.',
  testId:'source-transport-states',
  test:'با انتقال ساختگیِ قطع‌شده، نتیجه فقط «مدرک دریافت نشد» باشد؛ مرحلهٔ توقف ثبت شود و پیشنهاد یا استناد ساخته نشود.',
 }),
 'source-verification/SOURCE_SCOPE_MISMATCH':Object.freeze({
  priority:4,topic:'distinguish-source-version-and-scope',
  title:'بررسی جداگانهٔ نسخه و دامنهٔ منبع',
  reason:'شاهد بازبینی‌شده نشان می‌دهد بخشی از نمونه‌ها با نسخه یا دامنهٔ خواسته‌شده همخوان نبودند.',
  testId:'wrong-edition-fixture',
  test:'یک مدرک ساختگیِ ظاهراً معتبر ولی با نسخهٔ نادرست را وارد آزمون کن؛ مانا قبل از پیشنهاد با دلیل مشخص متوقف شود.',
 }),
 'receipt-recovery/UNKNOWN_AFTER_INTERRUPT':Object.freeze({
  priority:5,topic:'distinguish-unknown-and-finished-after-interruption',
  title:'تشخیص نتیجهٔ نامعلوم بعد از توقف و راه‌اندازی مجدد',
  reason:'در شاهد ثبت‌شده، توقف بعد از ثبت تلاش رخ داد اما وضعیت نهایی قابل تأیید نبود.',
  testId:'unknown-interruption-no-replay',
  test:'در یک آزمون محلی ساختگی پس از ثبت تلاش توقف ایجاد کن؛ شروع دوباره باید همان وضعیت نامعلوم و صفر اجرای تکراری را نشان دهد.',
 }),
 'receipt-recovery/REPLAY_RECEIPT_MISMATCH':Object.freeze({
  priority:5,topic:'check-equality-before-reusing-a-receipt',
  title:'اعتبارسنجی دوبارهٔ رسید پیش از استفاده',
  reason:'در بازخوانی ثبت‌شده، هویت یا اثرانگشت نتیجه با رسید بازبینی‌شده یکی نبود.',
  testId:'altered-receipt-fails-closed',
  test:'فقط دادهٔ یک رونوشت ساختگی از رسید را تغییر بده؛ بازخوانی باید آن را رد کند و هیچ اجرای تازه‌ای شروع نشود.',
 }),
 'jarvis-availability/WRONG_AVAILABILITY':Object.freeze({
  priority:4,topic:'verify-availability-count-and-time',
  title:'آزمون مستقل پیشنهاد زمان جارویس',
  reason:'دست‌کم یک پیشنهاد ثبت‌شده با جواب مرجع تقویم ساختگی یکسان نبود.',
  testId:'synthetic-calendar-boundary',
  test:'دو تقویم ساختگی با پایان و شروع هم‌زمان را با حل‌گر مستقل مقایسه کن؛ نخستین زمان آزادِ UTC و برچسب محلی دقیق باشند و دعوتی ارسال نشود.',
 }),
});
function need(ok,code){if(!ok){const error=new TypeError(code);error.code=code;throw error;}}
function shape(x,keys){
 return x&&[Object.prototype,null].includes(Object.getPrototypeOf(x))&&Reflect.ownKeys(x).length===keys.length&&keys.every(k=>{
  const d=Object.getOwnPropertyDescriptor(x,k);return d?.enumerable===true&&Object.hasOwn(d,'value');
 });
}
function idValid(x){return typeof x==='string'&&HEX.test(x);}
function rank(a,b){return b.priority-a.priority||(b.affectedCount*a.sampleCount-a.affectedCount*b.sampleCount)
 || b.affectedCount-a.affectedCount || (a.evidenceId<b.evidenceId?-1:a.evidenceId>b.evidenceId?1:0);}
function ideaId(family,topic){return createHash('sha256').update(SCHEMA+'\0'+family+'\0'+topic).digest('hex');}
function proposeEvidenceImprovementIdeas(input){
 need(shape(input,['trustedEvidence','priorIdeaIds']),'IDEA_REQUEST_INVALID');
 const {trustedEvidence:snapshot,priorIdeaIds}=input;
 need(shape(snapshot,['schema','observations'])&&snapshot.schema===INPUT&&Array.isArray(snapshot.observations)
  && snapshot.observations.length<=MAX_EVIDENCE,'REVIEWED_EVIDENCE_SNAPSHOT_REQUIRED');
 need(Array.isArray(priorIdeaIds)&&priorIdeaIds.length<=MAX_PRIOR,'PRIOR_ID_LIMIT');
 const prior=new Set();
 for(const id of priorIdeaIds){need(idValid(id)&&!prior.has(id),'PRIOR_ID_INVALID');prior.add(id);}
 const verificationIds=new Set(), candidates=new Map();
 for(const row of snapshot.observations){
  need(shape(row,['evidenceId','family','outcome','assessment','sampleCount','affectedCount']),'EVIDENCE_ROW_INVALID');
  const {evidenceId,family,outcome,assessment,sampleCount,affectedCount}=row;
  need(idValid(evidenceId)&&!verificationIds.has(evidenceId),'EVIDENCE_ID_INVALID');
  verificationIds.add(evidenceId);
  need(typeof family==='string'&&typeof outcome==='string'&&Object.hasOwn(familyOutcomes,family)&&familyOutcomes[family].includes(outcome),'EVIDENCE_OUTCOME_UNSUPPORTED');
  const knownRule=rules[family+'/'+outcome];
  const rankedAssessment=knownRule?.assessment??'CONFIRMED_GAP';
  need(assessment==='EXPECTED_BEHAVIOR'||(assessment===rankedAssessment&&knownRule),'EVIDENCE_ASSESSMENT_INVALID');
  const rule=assessment===rankedAssessment?knownRule:null;
  need(Number.isSafeInteger(sampleCount)&&sampleCount>=1&&sampleCount<=MAX_SAMPLES&&
   Number.isSafeInteger(affectedCount)&&affectedCount>=(rule?1:0)&&affectedCount<=(rule?sampleCount:0),'EVIDENCE_COUNTS_INVALID');
  if(!rule)continue;
  if(assessment==='CONFIRMED_OPPORTUNITY')need(sampleCount===1&&affectedCount===1,'CAMPAIGN_AGGREGATE_UNSUPPORTED');
  const id=ideaId(family,rule.topic), candidate={id,family,outcome,assessment,priority:rule.priority,evidenceId,sampleCount,affectedCount,rule};
  const old=candidates.get(id);
  if(!old||rank(candidate,old)<0)candidates.set(id,candidate);
 }
 const choices=[...candidates.values()].sort(rank);
 const active=choices.filter(v=>!prior.has(v.id));
 const ideas=active.map((row,i)=>{
  const {id,family,outcome,assessment,priority,evidenceId,sampleCount,affectedCount,rule}=row;
  return {id,rank:i+1,family,topic:rule.topic,title:rule.title,reason:rule.reason,
   evidence:{id:evidenceId,outcome,assessment,affectedCount,sampleCount,aggregatedAcrossReceipts:false},
   priority,leastNextAcceptanceTest:{id:rule.testId,description:rule.test,mode:'OFFLINE_SYNTHETIC_ONLY'},
   reviewRequired:true};
 });
 return {schema:SCHEMA,status:ideas.length?'IDEAS_PENDING_REVIEW':'NO_NEW_ACTIONABLE_IDEAS',ideas,
  observationsReviewed:snapshot.observations.length,suppressedPriorIdeas:choices.length-active.length,
  method:'DETERMINISTIC_RULES_FROM_HOST_VERIFIED_EVIDENCE_ONLY',actionsExecuted:0,modelCalls:0,
  modelTrainingPerformed:false,activationAuthorized:false,productionDeploymentAllowed:false};
}
module.exports={proposeEvidenceImprovementIdeas};
