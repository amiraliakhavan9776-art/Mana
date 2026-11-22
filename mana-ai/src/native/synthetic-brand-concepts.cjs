'use strict';
const {payloadDigest}=require('../approval-store.cjs');
const {loadFixture}=require('./synthetic-dxf-revision-impact.cjs');

const SCHEMA='MANA_SYNTHETIC_BRAND_CONCEPTS_V1';
const POLICY='SYNTHETIC_BRAND_STUDIO_CLOSED_BRIEF_V1';
const flags=Object.freeze({
 approved:false,publicationAllowed:false,productionDeploymentAllowed:false,
 researchPerformed:false,modelCalls:0,externalActions:0,licensedAssetsVerified:false,
});
const profiles=Object.freeze({
 'quiet-luxury':{fa:'وقار آرام',value:'مکث، نظم و کم‌گویی',options:[
  ['ordered-silence','سکوتِ منظم','محور عمودی، قاب باریک، حاشیهٔ باز',['#252727','#EBE5DA','#9A7458'],'فضای خالی در نمای اول و قاب‌بندی آرام'],
  ['warm-sequence','توالیِ گرم','خط افقی، لکهٔ رنگ گرم و چیدمان فصل‌بندی‌شده',['#432F32','#D7A77E','#F1ECE3'],'آغاز نزدیک و بازکردن تدریجی قاب'],
 ]},
 'measured-clarity':{fa:'شفافیت سنجیده',value:'خوانایی، تمایز و نظم',options:[
  ['calm-grid','شبکهٔ روشن','شبکهٔ ستونی، تیتر درشت و اعداد تک‌رنگ',['#183143','#F5F1E6','#567A86'],'ارائهٔ شبکهٔ روشن و یک نشانهٔ هندسی'],
  ['diagram-first','اول دیاگرام','سیلوئت ساده، تراز چپِ دیاگرام و تأکید زرد',['#242938','#E5B64E','#F6F3EA'],'شروع از شکل کلی و سپس جداسازی جزئیات'],
 ]},
});
const audiences=Object.freeze({
 'prospective-clients':['بازدیدکنندهٔ اولیه','متن کوتاه، دعوت به مشاهده، بدون وعدهٔ کیفیت تأییدنشده'],
 'design-reviewers':['گروه بازبینی طرح','متن دقیق، برجسته‌کردن شناسهٔ نسخه، تفکیک واقعیت از پیشنهاد'],
});
const channels=Object.freeze({
 'project-booklet':['دفترچهٔ پروژه','برای جلد و صفحات شروع فصل، یک نقش ساده و برچسب نسخهٔ خوانا'],
 'presentation':['ارائهٔ معرفی','برای اسلاید آغاز، یک قاب، تیتر کوتاه و یادداشت کوچک نسخه'],
});
const fixtureBrief=Object.freeze({
 projectId:'SYNTHETIC-AEC-DXF',profile:'quiet-luxury',audience:'prospective-clients',
 channels:Object.freeze(['project-booklet','presentation']), focus:'south-opening-21',
});
const fail=(reasonCode,status='ABSTAIN_NO_BRAND_ARTIFACT')=>({...flags,schema:SCHEMA,status,reasonCode});
const bad=Symbol('invalid');
function field(object,key){
 const d=Object.getOwnPropertyDescriptor(object,key);
 return d&&Object.hasOwn(d,'value')?d.value:bad;
}
function record(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype)return false;
 const actual=Reflect.ownKeys(value);
 return actual.length===keys.length&&keys.every(k=>field(value,k)!==bad);
}
function normalizeBrief(brief){
 if(!record(brief,['projectId','profile','audience','channels','focus']))return null;
 const {projectId,profile,audience,channels:list,focus}=brief;
 if(projectId!==fixtureBrief.projectId||focus!==fixtureBrief.focus||
   typeof profile!=='string'||!Object.hasOwn(profiles,profile)||
   typeof audience!=='string'||!Object.hasOwn(audiences,audience)||
   !Array.isArray(list)||Object.getPrototypeOf(list)!==Array.prototype||list.length<1||list.length>2||
   Reflect.ownKeys(list).length!==list.length+1)return null;
 const clean=Array.from({length:list.length},(_,i)=>field(list,String(i)));
 if(!clean.every(k=>typeof k==='string'&&Object.hasOwn(channels,k))||new Set(clean).size!==clean.length)return null;
 return {projectId,profile,audience,channels:clean.sort(),focus};
}
function makeSource(report,revision){
 const before=revision==='R1';
 const {opening}=report.measured;
 const src=before?opening.sourceBefore:opening.sourceAfter;
 return {
  facadeRevision:revision,
  facadeSha256:before?report.source.facadeBeforeSha256:report.source.facadeAfterSha256,
  floorSha256:report.source.floorSha256,
  dxfReportSha256:before?report.source.beforeDxfReportSha256:report.source.afterDxfReportSha256,
  openingEntitySha256:src.entitySha256,
  openingM2:before?opening.beforeM2:opening.afterM2,
  representation:'MEASURED_SYNTHETIC_DXF_2D',
  materialEvidence:'NOT_PROVIDED_BY_VERIFIED_SOURCE',
  photorealisticEvidence:'NOT_PROVIDED_BY_VERIFIED_SOURCE',
 };
}
function makePlan(brief,source){
 const profile=profiles[brief.profile];
 const [audienceFa,toneFa]=audiences[brief.audience];
 const summaries=brief.channels.map(key=>({id:key,title:channels[key][0]}));
 const options=profile.options.map(([id,title,layout,palette,entry])=>({
  id,title,layout,palette:[...palette],toneFa,
  channelNotes:brief.channels.map(key=>({id:key,title:channels[key][0],guidance:channels[key][1]})),
  storyboard:[
   {scene:1,kind:'PROPOSED_GRAPHIC',title:'ورود',direction:entry},
   {scene:2,kind:'SOURCE_GEOMETRY_ONLY',title:'مکث روی عنصر معماری',
    direction:'قاب شماتیک بازشوی ۲۱ از منبع دوبعدی؛ نه بازنمایی مصالح، نور واقعی یا رندر.',
    sourceEvidence:{facadeRevision:source.facadeRevision,openingM2:source.openingM2,entitySha256:source.openingEntitySha256}},
   {scene:3,kind:'PROPOSED_GRAPHIC',title:'پایان',
    direction:brief.audience==='design-reviewers'?'برچسب نسخه و محل ثبت نظر بازبین':'عنوان پروژه و دعوت به دیدن ادامهٔ دفترچه یا ارائه'},
  ],
 }));
 const body={schema:SCHEMA,policy:POLICY,status:'SYNTHETIC_HUMAN_REVIEW_ONLY',...flags,
  brief:{...brief,goalFa:profile.fa,positioningHypothesisFa:profile.value,audienceFa,outputs:summaries},
  source,claimPolicy:'SOURCE_DXF_GEOMETRY_ONLY_PALETTES_ARE_NOT_MATERIALS',options,
 };
 return {...body,proposalSha256:payloadDigest(body)};
}
const revisionOk=r=>r==='R1'||r==='R2';

// Explicitly project proposal data fields; never invoke an unknown accessor. Closed,
// bounded walker before canonical comparison, so callers cannot assert a valid receipt
// through dropped keys, accessor side effects, or a forged stored digest.
function jsonProof(value,depth=0,budget={left:1024,bytes:16384}){
 if(--budget.left<0||depth>12)throw Error('Complex brand proposal');
 if(typeof value==='string'){
  budget.bytes-=Buffer.byteLength(value);if(budget.bytes<0)throw Error('Long brand proposal');
  return value;
 }
 if(value===null||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))return value;
 if(Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype){
  if(value.length>32||Reflect.ownKeys(value).length!==value.length+1)throw Error('Invalid brand array');
  return Array.from({length:value.length},(_,i)=>jsonProof(field(value,String(i)),depth+1,budget));
 }
 if(!value||Object.getPrototypeOf(value)!==Object.prototype)throw Error('Invalid brand value');
 const keys=Reflect.ownKeys(value);
 if(keys.length>32||!keys.every(k=>typeof k==='string'&&/^[A-Za-z][A-Za-z0-9]+$/.test(k)&&k.length<=64))throw Error('Invalid brand record');
 return Object.fromEntries(keys.map(k=>[k,jsonProof(field(value,k),depth+1,budget)]));
}

function createSyntheticBrandStudio(){
 // The caller selects a known facade revision, never supplies architecture claims, a digest
 // to trust, raw marketing text, an external source URL, or an artifact path.
 function propose({brief,revision}={}){
  if(brief==null)return fail('BRIEF_REQUIRED');
  const clean=normalizeBrief(brief);
  if(!clean)return fail('BRIEF_DATA_UNSUPPORTED');
  if(!revisionOk(revision))return fail('SOURCE_REVISION_UNSUPPORTED');
  try{return makePlan(clean,makeSource(loadFixture(),revision));}
  catch{return fail('ARCHITECTURE_EVIDENCE_UNVERIFIED');}
 }
 function verify({proposal,revision}={}){
  if(!revisionOk(revision))return {result:fail('SOURCE_REVISION_UNSUPPORTED')};
  let report;
  try{report=loadFixture();}
  catch{return {result:fail('ARCHITECTURE_EVIDENCE_UNVERIFIED')};}
  const invalid={result:fail('PROPOSAL_UNVERIFIED')};
  try{
   const candidate=jsonProof(proposal);
   if(!record(candidate.brief,['projectId','profile','audience','channels','focus','goalFa','positioningHypothesisFa','audienceFa','outputs']))return invalid;
   const {projectId,profile,audience,channels,focus}=candidate.brief;
   const clean=normalizeBrief({projectId,profile,audience,channels,focus});
   const priorRevision=candidate.source?.facadeRevision;
   if(!clean||!revisionOk(priorRevision))return invalid;
   const original=makePlan(clean,makeSource(report,priorRevision));
   if(payloadDigest(candidate)!==payloadDigest(original))return invalid;
   const current=makeSource(report,revision);
   if(original.source.facadeRevision!==revision||payloadDigest(original.source)!==payloadDigest(current))
    return {result:fail('ARCHITECTURE_SOURCE_CHANGED','STALE_NO_BRAND_ARTIFACT')};
   return {original,result:{...flags,schema:SCHEMA,status:'CURRENT_HUMAN_REVIEW_ONLY',proposalSha256:original.proposalSha256}};
  }catch{return invalid;}
 }
 function check(input){return verify(input).result;}
 function render(input){
  const {result,original}=verify(input);
  return original?{...result,markdown:renderMarkdown(original)}:result;
 }
 return Object.freeze({propose,check,render});
}

function renderMarkdown(p){
 const s=p.source,b=p.brief;
 return [
  '# هویت پروژه و استوری‌بورد | نمونهٔ کاملاً ساختگی','',
  '**پیش‌نویس برای بازبینی؛ نه قابل انتشار، نه رندر، نه مشخصات مصالح.**','',
  '## شرح برند','',
  `- هدف هویت: ${b.goalFa}`,
  `- فرضیهٔ جایگاه‌یابی (بدون تحقیق بازار): ${b.positioningHypothesisFa}`,
  `- مخاطب: ${b.audienceFa}`,
  `- خروجی موردنظر: ${b.outputs.map(x=>x.title).join('، ')}`,'',
  '## آنچه از معماری واقعاً مستند است','',
  `بازشوی ۲۱ در نمای دوبعدی ساختگی ${s.facadeRevision}: **${s.openingM2} مترمربع**. هیچ مصالح، شیشه، نور واقعی یا رندر سه‌بعدی از این مدرک احراز نشده است؛ رنگ‌ها صرفاً پیشنهاد گرافیکی هستند.`,'',
  `- هش فایل نما: \`${s.facadeSha256}\``,
  `- هش گزارش DXF همان نسخه: \`${s.dxfReportSha256}\``,
  `- هش موجودیت بازشو: \`${s.openingEntitySha256}\``,'',
  ...p.options.flatMap((o,i)=>[
   `## مسیر ${i+1} | ${o.title}`,'',
   `- ساختار گرافیکی: ${o.layout}`,
   `- پالت پیشنهادی، نه مصالح: ${o.palette.map(v=>'\x60'+v+'\x60').join('، ')}`,
   `- لحن: ${o.toneFa}`,
   ...o.channelNotes.map(v=>`- ${v.title}: ${v.guidance}`),'',
   '### استوری‌بورد','',
   ...o.storyboard.map(v=>`${v.scene}. **${v.title}**: ${v.direction}${v.sourceEvidence?' ('+v.sourceEvidence.facadeRevision+'، '+v.sourceEvidence.openingM2+' مترمربع)':''}`),'',
  ]),
  '## پیش از استفاده','',
  'یک مسیر را برای بازبینی انتخاب کنید، هندسه را با نسخهٔ جاری تطبیق دهید و هر ادعا و مجوز دارایی بصری را جداگانه بررسی کنید. این فایل اجازهٔ انتشار ایجاد نمی‌کند.','',
  `شناسهٔ پیش‌نویس: \`${p.proposalSha256}\``,'',
 ].join('\n');
}

if(require.main===module){
 const [revision,format='markdown',...extra]=process.argv.slice(2);
 const studio=createSyntheticBrandStudio();
 const p=extra.length||!['markdown','json'].includes(format)?
  fail('BAD_DEMO_COMMAND'):studio.propose({brief:fixtureBrief,revision});
 const r=p.status!=='SYNTHETIC_HUMAN_REVIEW_ONLY'||format==='json'?p:studio.render({proposal:p,revision});
 if(r.status!=='SYNTHETIC_HUMAN_REVIEW_ONLY'&&r.status!=='CURRENT_HUMAN_REVIEW_ONLY')process.exitCode=1;
 process.stdout.write(r.markdown??JSON.stringify(r)+'\n');
}
module.exports={createSyntheticBrandStudio,fixtureBrief};
