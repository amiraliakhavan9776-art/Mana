'use strict';
// Read-only quantity report rooted in the exact previously accepted NASA lesson.
// This is deterministic gross geometry, not execution or activation of a learned candidate.
const {createNasaAreaExperiment}=require('./nasa-area-experiment.cjs');
const {INDEX_URL,AREA_URL,SCOPE}=require('./nasa-area-source.cjs');
const {twiceArea}=require('./aec-learner-oracle.cjs');
const {calculateFloorTakeoff}=require('../src/native/floor-takeoff.cjs');
const {parseExactJSON}=require('../src/exact-json.cjs');
const {payloadDigest}=require('../src/approval-store.cjs');

const SOURCE_SHA256='ee6cfe639a6dee602af883fb1411fcb5a8a6e46f35be92421fa937ad69180cef';
const CLAUSE_SHA256='ab3e9dc59dc4cb009e9c0b37638ad37d61fd3d016f0547a5fe8a87459c8b05d1';
const EXPERIMENT_ID='nasa-gross-planar-trapezoid-experiment-v1';
const LIMITS=Object.freeze(['GROSS_GEOMETRY_ONLY','NO_DEDUCTIONS_OR_NET_AREA','NO_PRICING_OR_PAY_QUANTITY',
 'NO_CONTRACTUAL_REGULATORY_OR_STRUCTURAL_INTERPRETATION','NO_FIELD_MEASUREMENT_OR_DESIGN_CERTIFICATION']);
const PERSIAN_LIMITS='فقط سطح هندسی ناخالص از ابعاد ورودی؛ بدون کسورات، سطح خالص، قیمت‌گذاری، مقدار قابل پرداخت، تفسیر قراردادی یا مقرراتی، تأیید اندازه‌برداری یا تأیید مهندسی.';
const SHAPES=Object.freeze({
 rectangle:Object.freeze({fields:Object.freeze(['base_mm','perpendicular_height_mm']),id:'gross-planar-rectangle-v1',
  formula:'A = b × h',title:'مستطیل',labels:Object.freeze(['قاعده','ارتفاع عمود بر قاعده'])}),
 trapezoid:Object.freeze({fields:Object.freeze(['parallel_base_a_mm','parallel_base_b_mm','perpendicular_height_mm']),id:'gross-planar-trapezoid-v1',
  formula:'A = (a + b) × h ÷ 2',title:'ذوزنقه',labels:Object.freeze(['قاعدهٔ موازی اول','قاعدهٔ موازی دوم','فاصلهٔ عمود بین دو قاعده'])}),
});
const fail=code=>{const error=Error(code);error.code=code;throw error;};
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const data=(obj,key)=>{
 const d=Object.getOwnPropertyDescriptor(obj,key);
 if(!d||!d.enumerable||!Object.hasOwn(d,'value'))fail('NASA_QUANTITY_INPUT_NOT_SUPPORTED');
 return d.value;
};
function inputProfile(input){
 if(!input||typeof input!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(input)))fail('NASA_QUANTITY_INPUT_NOT_SUPPORTED');
 const shape=data(input,'shape'),unit=data(input,'unit');
 if(typeof shape!=='string'||!Object.hasOwn(SHAPES,shape))fail('NASA_QUANTITY_SHAPE_NOT_SUPPORTED');
 if(unit!=='mm')fail('NASA_QUANTITY_WHOLE_MILLIMETERS_REQUIRED');
 const {fields}=SHAPES[shape],expected=['shape','unit',...fields],keys=Reflect.ownKeys(input);
 if(keys.length!==expected.length||!expected.every(k=>keys.includes(k)))fail('NASA_QUANTITY_INPUT_NOT_SUPPORTED');
 const entries=fields.map(k=>{
  const v=data(input,k);
  if(!Number.isSafeInteger(v)||v<1||v>100000)fail('NASA_QUANTITY_WHOLE_MILLIMETERS_REQUIRED');
  return [k,v];
 });
 return {shape,unit,...Object.fromEntries(entries)};
}
function fixed(n,places){
 const s=n.toString().padStart(places+1,'0'),f=s.slice(-places).replace(/0+$/u,'');
 return s.slice(0,-places)+(f?'.'+f:'');
}
function calculateGrossPlanar(input){
 const normalized=inputProfile(input),shape=normalized.shape,p=SHAPES[shape];
 const dims=p.fields.map(k=>BigInt(normalized[k]));
 let numerator,verifiedBy;
 if(shape==='rectangle'){
  const [base,height]=dims;
  numerator=2n*base*height;
  const native=calculateFloorTakeoff({length_m:fixed(base,3),width_m:fixed(height,3),excluded_area_m2:'0'});
  if(native.unit!=='m2'||native.gross_area_m2!==fixed(numerator*5n,7))fail('NASA_QUANTITY_ARITHMETIC_DISAGREEMENT');
  verifiedBy='NATIVE_EXACT_RECTANGULAR_GROSS_AREA';
 }else{
  const [a,b,h]=dims;
  numerator=(a+b)*h;
  if(twiceArea(dims)!==numerator)fail('NASA_QUANTITY_ARITHMETIC_DISAGREEMENT');
  verifiedBy='INDEPENDENT_INTEGER_SHOELACE';
 }
 return {input:normalized,formula:{id:p.id,display:p.formula},
  quantity:{kind:'gross_planar_area',twiceAreaMm2:numerator.toString(),denominator:2,
   mm2:fixed(numerator*5n,1),m2:fixed(numerator*5n,7),roundingApplied:false},
  computationCheck:verifiedBy};
}
function verifiedProvenance(r){
 if(!(r?.status==='AWAITING_HUMAN_REVIEW'&&r.reused===true&&r.sourceMode==='direct'&&r.transport==='DIRECT_OFFICIAL_HTTPS'&&
      r.experimentId===EXPERIMENT_ID&&r.scope===SCOPE&&r.sourceUrl===AREA_URL&&r.indexUrl===INDEX_URL&&
      r.sourceSha256===SOURCE_SHA256&&r.clauseSha256===CLAUSE_SHA256&&r.passed===16&&r.total===16&&r.testsRun===16&&
      [r.indexSha256,r.evidenceSha256,r.freezeSha256,r.gradeSha256,r.candidateSha256].every(hex)&&
      r.activationAuthorized===false&&r.productionDeploymentAllowed===false&&r.modelCalls===0&&r.modelTrainingPerformed===false))
  fail('NASA_QUANTITY_SOURCE_UNVERIFIED');
 return {lessonUrl:AREA_URL,indexUrl:INDEX_URL,sourceSha256:r.sourceSha256,indexSha256:r.indexSha256,
  sourceMode:'VERIFIED_PRIOR_DIRECT_OFFICIAL_HTTPS',evidenceSha256:r.evidenceSha256,
  priorTrapezoidExperiment:{id:r.experimentId,scope:'TRAPEZOID_BENCHMARK_ONLY',clauseSha256:r.clauseSha256,
   candidateSha256:r.candidateSha256,freezeSha256:r.freezeSha256,gradeSha256:r.gradeSha256,passed:16,total:16}};
}
function markdown(r){
 const {input,formula,quantity:q,provenance:p}=r,profile=SHAPES[input.shape],old=p.priorTrapezoidExperiment;
 return [
  '# گزارش آزمایشی مترهٔ سطح ناخالص','',`شکل: ${profile.title}`,'',
  ...profile.fields.map((f,i)=>`- ${profile.labels[i]}: ${input[f]} میلی‌متر`),'',
  `فرمول (${formula.id}): \`${formula.display}\``,'',
  `**نتیجهٔ دقیق: ${q.mm2} میلی‌متر مربع = ${q.m2} متر مربع** (بدون گردکردن)`,'',
  `منبع آموزشی: [صفحهٔ مساحت ناسا](${p.lessonUrl})، نسخهٔ \`${p.sourceSha256}\`.`,
  `شناسهٔ مدرک نسخه: \`${p.evidenceSha256}\`.`,'',
  `آزمون مستقل اجرای قبلی فقط برای ذوزنقه: ${old.passed} از ${old.total}؛ شناسهٔ نتیجه: \`${old.gradeSha256}\`.`,
  'این گزارش محاسبهٔ قطعی تازه روی ابعاد ورودی است، نه ساخت، اجرای عملیاتی یا فعال‌سازی نامزدِ یادگیری.','',
  `**حدود کاربرد:** ${PERSIAN_LIMITS}`,'',
  `شناسهٔ گزارش: \`${r.reportSha256}\``,'',
 ].join('\n');
}
function createNasaQuantityReporter({workspace,pythonPath}={}){
 let experiment;
 try{
  experiment=createNasaAreaExperiment({workspace,pythonPath,mode:'direct',request:()=>fail('NASA_QUANTITY_NETWORK_DISABLED')});
 }catch{fail('NASA_QUANTITY_SOURCE_UNVERIFIED');}
 return {report(input){
  // Reject invalid geometry before opening any existing evidence record.
  const result=calculateGrossPlanar(input);
  let receipt;
  try{receipt=experiment.history();}catch{fail('NASA_QUANTITY_SOURCE_UNVERIFIED');}
  const provenance=verifiedProvenance(receipt);
  const value={schema:'MANA_NASA_GROSS_QUANTITY_REPORT_V1',status:'REPORT_READY',
   ...result,provenance,limits:[...LIMITS],promotionAllowed:false,productionDeploymentAllowed:false,
   activationAuthorized:false,learnedCandidateUsedForReport:false,previousBenchmarkRevalidated:true,
   networkRequests:0,modelCalls:0,stateWrites:0};
  const report={...value,reportSha256:payloadDigest(value)};
  return {report,markdown:markdown(report)};
 }};
}
if(require.main===module){
 try{
  const [workspace,pythonPath,format,raw,...rest]=process.argv.slice(2);
  if(rest.length||!['json','markdown'].includes(format)||typeof raw!=='string'||Buffer.byteLength(raw)>512)
   fail('NASA_QUANTITY_INPUT_NOT_SUPPORTED');
  let input;
  try{input=parseExactJSON(raw);}catch{fail('NASA_QUANTITY_INPUT_NOT_SUPPORTED');}
  const result=createNasaQuantityReporter({workspace,pythonPath}).report(input);
  process.stdout.write(format==='json'?JSON.stringify(result.report)+'\n':result.markdown);
 }catch(error){
  const allowed=new Set(['NASA_QUANTITY_INPUT_NOT_SUPPORTED','NASA_QUANTITY_SHAPE_NOT_SUPPORTED',
   'NASA_QUANTITY_WHOLE_MILLIMETERS_REQUIRED','NASA_QUANTITY_ARITHMETIC_DISAGREEMENT','NASA_QUANTITY_SOURCE_UNVERIFIED']);
  console.log(JSON.stringify({schema:'MANA_NASA_GROSS_QUANTITY_REPORT_V1',status:'ABSTAIN',
   reasonCode:allowed.has(error?.code)?error.code:'NASA_QUANTITY_UNVERIFIED',activationAuthorized:false}));
  process.exitCode=1;
 }
}
module.exports={calculateGrossPlanar,createNasaQuantityReporter};
