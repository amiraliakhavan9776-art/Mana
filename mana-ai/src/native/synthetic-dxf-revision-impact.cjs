'use strict';
// Local synthetic evidence only. No file changes, actual artifact creation or release actions.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {payloadDigest}=require('../approval-store.cjs');
const {inspectSyntheticDxf,compareSyntheticDxf}=require('./synthetic-aec-dxf.cjs');
const {createArtifactImpact}=require('./artifact-impact.cjs');
const SCHEMA='MANA_SYNTHETIC_DXF_ARTIFACT_REVISION_V1',POLICY='SYNTHETIC-FA-SOUTH-OPENING-21-V1';
const FIXTURES=Object.freeze({
 floorBytes:['floor-r1-r2.dxf','4b6e6019945ee748fbd42a12daad06d9a91b3d5e790530f8dea089138efa87bf'],
 beforeFacadeBytes:['south-facade-r1.dxf','2ea9e764f5747dea78c04b0eab27f0b4da789aa0ab78b8dd9b08afe85986994b'],
 afterFacadeBytes:['south-facade-r2.dxf','381b2c09208534b55c649459305c48de047ce4c8f85b3e740d9a27d60f03effa'],
});
const project=Object.freeze({id:'SYNTHETIC-AEC-DXF',orgId:'MANA-LOCAL-LAB'});
const principal=Object.freeze({id:'synthetic-lab-reader',orgId:project.orgId,role:'analyst',
 projectIds:Object.freeze([project.id]),capabilityIds:Object.freeze(['native.artifacts.impact'])});
const FLOOR='ARCH-FLOOR-001',FACADE='FACADE-SOUTH-001';
// These links are exact assumptions of this test registry, not observed real projects or generated files.
const defs=[
 ['QTY-FACADE-001','quantity',[FACADE],'مترهٔ نما','بازشوی مستند بزرگ‌تر است؛ ردیف بازشو و جمع خالص باید با R2 بازبینی شوند.'],
 ['COST-FACADE-001','cost',['QTY-FACADE-001'],'برآورد هزینه','مبنای مقدار عوض شده است؛ هیچ نرخ یا مبلغی در این نمونه محاسبه نشده است.'],
 ['PROC-FACADE-001','procurement',['QTY-FACADE-001'],'تدارکات','ابعاد بازشو و مبنای مقدار نیاز به بررسی دارند؛ هیچ سفارش یا مصرفی برآورد نشده است.'],
 ['SCHED-FACADE-001','schedule',['PROC-FACADE-001'],'برنامهٔ زمان‌بندی','اگر تأمین بر زمان اثر بگذارد، برنامه بازبینی می‌شود؛ تأخیر یا مدت جدید اثبات نشده است.'],
 ['CONTRACT-FACADE-001','contract',['COST-FACADE-001',FACADE],'مبنای قراردادی','فقط احتمال نیاز به کنترل محدوده؛ نه دستورکار، کسور، ادعا یا مبلغ قابل پرداخت.'],
 ['BOOKLET-FACADE-001','booklet',['QTY-FACADE-001','SCHED-FACADE-001',FACADE],'دفترچهٔ نما','هر خلاصه‌ای که به نمای R1 متکی است باید بررسی شود؛ هیچ دفترچه‌ای تولید نشده است.'],
 ['VISUAL-FACADE-001','visual-brief',[FACADE],'شرح بصری نما','جای بازشو و تناسبات باید طبق R2 کنترل شود؛ تصویر یا رندر تازه تولید نشده است.'],
];
const outside=[
 ['BIM-GRID-001','bim-reference',[FLOOR],'محور BIM'],
 ['MECH-HVAC-001','mep-reference',[FLOOR],'مکانیک'],
 ['ELEC-POWER-001','mep-reference',[FLOOR],'برق'],
 ['INT-OTHER-LEVEL-001','interior-reference',[FLOOR],'فضای داخلیِ طبقهٔ دیگر'],
];
const safe=Object.freeze({noActualArtifactsRegenerated:true,noCommercialOrProfessionalDecision:true,constructionApproved:false,
 approved:false,productionDeploymentAllowed:false,actionsExecuted:0,stateWrites:0,networkRequests:0,modelCalls:0});
const sha=b=>createHash('sha256').update(b).digest('hex');
const order=(a,b)=>a<b?-1:a>b?1:0;
const fail=code=>{const e=Error(code);e.code=code;throw e;};
const need=(a,code='SYNTHETIC_DXF_IMPACT_UNVERIFIED')=>{if(!a)fail(code);};
const hashByKey=Object.fromEntries(Object.entries(FIXTURES).map(([k,v])=>[k,v[1]]));

function readExact(name,expected){
 const p=path.resolve(__dirname,'../../examples/synthetic-aec-dxf',name),c=fs.constants;
 need(fs.realpathSync(p)===p);
 const fd=fs.openSync(p,c.O_RDONLY|c.O_NOFOLLOW|c.O_NONBLOCK);
 try{
  const s=fs.fstatSync(fd);
  need(s.isFile()&&s.size>0&&s.size<=32768);
  const b=Buffer.alloc(s.size+1);let n=0;
  while(n<b.length){const k=fs.readSync(fd,b,n,b.length-n,null);if(!k)break;n+=k;}
  need(n===s.size&&sha(b.subarray(0,n))===expected,'SYNTHETIC_DXF_FIXTURE_PIN_MISMATCH');
  return b.subarray(0,n);
 }finally{fs.closeSync(fd);}
}
function pinBuffers(input){
 const out={};
 need(input&&Object.getPrototypeOf(input)===Object.prototype&&Reflect.ownKeys(input).length===3);
 for(const [k,hash] of Object.entries(hashByKey)){
  const d=Object.getOwnPropertyDescriptor(input,k);
  need(d&&Object.hasOwn(d,'value')&&Buffer.isBuffer(d.value)&&d.value.length>0&&d.value.length<=32768);
  out[k]=Buffer.from(d.value);
  need(sha(out[k])===hash,'SYNTHETIC_DXF_FIXTURE_PIN_MISMATCH');
 }
 return out;
}
const source=(id,kind,version,sha256)=>({id,kind,version,sha256,dependsOn:[],requiresApproval:true,requiresProfessionalSignoff:id===FACADE});
const pin=({id,version,sha256})=>({id,version,sha256});
const sort=a=>[...a].sort((x,y)=>order(x.id,y.id));
function registryFor(a,b){
 const priorFloor=source(FLOOR,'dxf','FLOOR-R1',a.planSha256),priorFacade=source(FACADE,'dxf',a.revision,a.facadeSha256);
 const original=new Map([[FLOOR,priorFloor],[FACADE,priorFacade]]);
 for(const [id,kind,deps] of [...defs,...outside]){
  const dependsOn=sort(deps.map(r=>pin(original.get(r))));
  const row={id,kind,version:'MODEL-R1',sha256:payloadDigest({schema:'DECLARED_SYNTHETIC_REFERENCE_NOT_A_REAL_FILE',
   id,kind,policy:POLICY,dependsOn}),dependsOn,requiresApproval:defs.some(([d])=>d===id),requiresProfessionalSignoff:id==='VISUAL-FACADE-001'};
  original.set(id,row);
 }
 const envelope=artifacts=>({organizationId:project.orgId,projectId:project.id,artifacts:sort(artifacts)});
 const all=[...original.values()];
 return {before:envelope(all),after:envelope(all.map(x=>x.id===FACADE?source(FACADE,'dxf',b.revision,b.facadeSha256):x))};
}
const get=(report,id)=>report.rows.find(x=>x.id===id);
function buildSyntheticDxfRevision(input){
 const {floorBytes,beforeFacadeBytes,afterFacadeBytes}=pinBuffers(input);
 const previous={revision:'R1',floorBytes,facadeBytes:beforeFacadeBytes},next={revision:'R2',floorBytes,facadeBytes:afterFacadeBytes};
 const a=inspectSyntheticDxf(previous),b=inspectSyntheticDxf(next),delta=compareSyntheticDxf(previous,next);
 const windowId='SOUTH.OPENING.21',netId='SOUTH.NET',primitiveChange=delta.changes.filter(x=>x.id.startsWith('SOUTH.OPENING.')&&x.sourceEntityChanged);
 const win=primitiveChange[0],net=delta.changes.find(x=>x.id===netId);
 need(delta.beforeReportSha256===a.reportSha256&&delta.afterReportSha256===b.reportSha256&&a.planSha256===b.planSha256&&
  a.facadeSha256!==b.facadeSha256&&primitiveChange.length===1&&win.id===windowId&&win.change==='QUANTITY_CHANGED'&&
  get(a,'SOUTH.GROSS').sources[0].entitySha256===get(b,'SOUTH.GROSS').sources[0].entitySha256&&
  win.beforeM2==='6'&&win.afterM2==='7.5'&&net.beforeM2==='207'&&net.afterM2==='205.5'&&net.deltaM2==='-1.5');
 const {before,after}=registryFor(a,b);
 const expected={before:payloadDigest(before),after:payloadDigest(after)};
 const impact=createArtifactImpact({
  authorize:(p,action,proj)=>p===principal&&proj===project&&action==='artifacts.impact',
  verifySnapshot:({role,snapshot,digest,principal:p,project:proj})=>p===principal&&proj===project&&
   Object.hasOwn(expected,role)&&expected[role]===digest&&payloadDigest(snapshot)===digest,
 }).analyze({before,after,principal,project});
 need(impact.status==='CHANGE_IMPACT_PROPOSED'&&impact.changedArtifactIds.length===1&&impact.changedArtifactIds[0]===FACADE&&
  impact.refreshOrder.length===defs.length&&impact.actionsExecuted===0&&impact.approved===false&&impact.artifactsChanged===false);
 const records=new Map(impact.impacts.map(row=>[row.artifactId,row]));
 const flags=defs.map(([id,kind,deps,titleFa,reasonFa])=>{
  const r=records.get(id);
  need(r?.reviewRequired&&r.causeArtifactIds.includes(FACADE)&&
   ['STALE_DEPENDENCY_BINDING','UPSTREAM_CHANGE_REVIEW_REQUIRED'].includes(r.status)&&!r.blockedByMissingDependencies);
  return {id,kind,titleFa,reasonFa,modeledDependencies:[...deps],status:r.status,reviewRequired:true,artifactWasRegenerated:false};
 });
 const untouched=[[FLOOR,'پلان کف'] ,...outside.map(([id,,,label])=>[id,label])].map(([id,titleFa])=>{
  need(!records.has(id));return {id,titleFa,status:'NO_DECLARED_LINK_TO_THIS_CHANGE',referenceOnly:id!==FLOOR};
 });
 const body={schema:SCHEMA,status:'SYNTHETIC_HUMAN_REVIEW_ONLY',policy:POLICY,
  scenario:'OPENING_21_STIPULATED_AS_WINDOW_NOT_INFERRED_FROM_CAD',registryBasis:'DECLARED_TEST_LINKS_ONLY_NO_EXISTING_DOWNSTREAM_FILES_VERIFIED',
  measured:{opening:{id:windowId,handle:'21',beforeM2:win.beforeM2,afterM2:win.afterM2,deltaM2:win.deltaM2,
   sourceBefore:get(a,windowId).sources[0],sourceAfter:get(b,windowId).sources[0]},
   southNet:{beforeM2:net.beforeM2,afterM2:net.afterM2,deltaM2:net.deltaM2},floorM2:get(a,'FLOOR.GROSS').quantity.m2},
  source:{floorRevision:'FLOOR-R1',facadeBeforeRevision:a.revision,facadeAfterRevision:b.revision,floorSha256:a.planSha256,
   facadeBeforeSha256:a.facadeSha256,facadeAfterSha256:b.facadeSha256,beforeDxfReportSha256:a.reportSha256,afterDxfReportSha256:b.reportSha256,
   dxfComparisonSha256:delta.reportSha256},
  evidence:{artifactImpactSchema:impact.schema,beforeRegistrySha256:impact.beforeDigest,afterRegistrySha256:impact.afterDigest,
   sourcesToRecheck:[...impact.sourceReviewArtifactIds],reviewOrder:[...impact.refreshOrder]},
  flags,untouched,...safe};
 return {...body,reportSha256:payloadDigest(body)};
}
function loadFixture(){return buildSyntheticDxfRevision(Object.fromEntries(Object.entries(FIXTURES).map(([k,row])=>[k,readExact(...row)])));}
function renderMarkdown(r){
 const w=r.measured.opening,n=r.measured.southNet,s=r.source;
 return [
  '# اثر بازنگری نمای جنوبی | نمونهٔ ساختگی','',
  '**فقط برای بازبینی انسانی.** هیچ خروجی وابسته‌ای بازتولید یا تأیید نشده است.','',
  `بازشوی ${w.handle} (در این سناریو فرض شده پنجره باشد) از ${w.beforeM2} به ${w.afterM2} متر مربع رسید. خالص هندسی نما از ${n.beforeM2} به ${n.afterM2} متر مربع رسید (تغییر: ${n.deltaM2} متر مربع). سطح کف ${r.measured.floorM2} متر مربع و بدون تغییر است.`,'',
  '## وابستگی‌های اعلام‌شده که نیاز به بازبینی دارند','',
  ...r.flags.map(f=>`- **${f.titleFa}** (${f.id}، ${f.status==='STALE_DEPENDENCY_BINDING'?'مدرک مستقیم قدیمی':'بازبینی به‌واسطهٔ وابستگی'}): ${f.reasonFa}`),'',
  `**بدون پیوند به این تغییر در مدل آزمایش:** ${r.untouched.map(x=>x.titleFa+' ('+x.id+')').join('، ')}. جز پلان، این‌ها صرفاً جای‌نگهدارند؛ نقشه یا مدل بین‌رشته‌ای آن‌ها خوانده یا کنترل نشده است.`,'',
  `منبع نما: ${s.facadeBeforeRevision} \`${s.facadeBeforeSha256}\` → ${s.facadeAfterRevision} \`${s.facadeAfterSha256}\`.`,
  `نسخهٔ ثابت پلان: ${s.floorRevision} \`${s.floorSha256}\`.`,
  `شناسهٔ گزارش: \`${r.reportSha256}\`.`,'',
 ].join('\n');
}
if(require.main===module){
 try{
  const [format='markdown',...extra]=process.argv.slice(2);
  need(!extra.length&&['json','markdown'].includes(format),'SYNTHETIC_DXF_IMPACT_BAD_COMMAND');
  const r=loadFixture();
  process.stdout.write(format==='json'?JSON.stringify(r)+'\n':renderMarkdown(r));
 }catch(e){
  const ok=['SYNTHETIC_DXF_IMPACT_BAD_COMMAND','SYNTHETIC_DXF_FIXTURE_PIN_MISMATCH'];
  console.log(JSON.stringify({schema:SCHEMA,status:'ABSTAIN_NO_IMPACT_REPORT',reasonCode:ok.includes(e?.code)?e.code:'SYNTHETIC_DXF_IMPACT_UNVERIFIED',...safe}));
  process.exitCode=1;
 }
}
module.exports={buildSyntheticDxfRevision,loadFixture};
