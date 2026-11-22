'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {start}=require('./aec-instruction-preview.cjs');
const {readBound}=require('./aec-instruction-runner.cjs');
const {createQueueResearchRunner,HOLDOUT_SHA256}=require('./runner.cjs');
const {createNasaAreaExperiment}=require('./nasa-area-experiment.cjs');
const {supportsMissionSelectionInstruction}=require('./mission-selection-runner.cjs');
const {APPROVED_PERSIAN_COMMAND,parsePersianResearchInstruction}=require('./persian-intake.cjs');
const {selectResearchMission,RESEARCH_MISSION_ID}=require('./queue.cjs');
const {REPOSITORY,COMMIT}=require('./cpython-source.cjs');
const {INDEX_URL,AREA_URL}=require('./nasa-area-source.cjs');
const {ID:AEC_CASE}=require('./aec-source.cjs');

const AEC_ID='6d213a1b0d0b2a93';
const CPY_SOURCE='https://github.com/'+REPOSITORY+'/blob/'+COMMIT+'/Doc/library/math.rst';
const NASA_SHA='ee6cfe639a6dee602af883fb1411fcb5a8a6e46f35be92421fa937ad69180cef';
const SAFE=Object.freeze({receiptReview:true,activationAuthorized:false,productionDeploymentAllowed:false,
 modelCalls:0,modelTrainingPerformed:false,fullMissionComplete:false,reviewedCount:2,reused:true});
const abs=p=>typeof p==='string'&&p.length<4096&&!p.includes('\0')&&path.isAbsolute(p)&&path.resolve(p)===p;
const hex=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error(code);};
const cleanDir=p=>fs.realpathSync(p)===p&&fs.lstatSync(p).isDirectory();
const nested=(a,b)=>a===b||a.startsWith(b+path.sep);
const title='مترهٔ سطح ناخالص قطعهٔ ذوزنقه‌ای';
const cpyTitle='موتور پژوهش: قاعدهٔ ضرب و جمع از مستند رسمی پایتون';

function createReceiptReviewRunner({queueBytes,masterBytes,readCpython,readNasa}={}){
 need(typeof readCpython==='function'&&typeof readNasa==='function','RECEIPT_READERS_REQUIRED');
 const p=selectResearchMission(queueBytes);
 const master=parsePersianResearchInstruction(APPROVED_PERSIAN_COMMAND,{masterBytes});
 need(p.status==='READY'&&master.status==='ACCEPTED'&&p.master.documentSha256===master.master.documentSha256&&
  [p.master,p.master.testSection].every(s=>sha(masterBytes.subarray(s.byteStart,s.byteEndExclusive))===s.sectionSha256),'RECEIPT_MASTER_PIN_MISMATCH');
 const queue=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(queueBytes));
 const two=queue.missions.filter(r=>r.id===RESEARCH_MISSION_ID||r.id===AEC_ID);
 need(two.length===2&&two[0].id===RESEARCH_MISSION_ID&&two[1].id===AEC_ID&&two[1].domain==='Technical office'&&
  two.every(r=>r.state==='PENDING_REVIEW'&&r.productionDeploymentAllowed===false),'RECEIPT_QUEUE_SCOPE_INVALID');
 function noReceipt(validatedCount,reason){
  return {...SAFE,status:'RECEIPT_UNVERIFIED',validatedCount,selectedBecause:reason,nextCaseId:null};
 }
 function inspect(){
  const cp=readCpython();
  if(!(cp?.missionId===RESEARCH_MISSION_ID&&cp.status==='AWAITING_HUMAN_REVIEW'&&cp.sourceMode==='official-https'&&
       cp.sourceUrl===CPY_SOURCE&&cp.passed===16&&cp.total===16&&
       [cp.candidate,cp.bridgeReceiptSha256,cp.captureSha256,cp.sourceProvenanceSha256].every(hex)))
   return noReceipt(0,'رسید معتبر اجرای قبلی پایتون پیدا یا تأیید نشد. این پیش‌نمایش چیزی را دوباره اجرا نمی‌کند.');
  const nasa=readNasa();
  if(!(nasa?.status==='AWAITING_HUMAN_REVIEW'&&nasa.experimentId==='nasa-gross-planar-trapezoid-experiment-v1'&&
       nasa.sourceMode==='direct'&&nasa.transport==='DIRECT_OFFICIAL_HTTPS'&&nasa.reused===true&&nasa.passed===16&&nasa.total===16&&nasa.testsRun===16&&
       nasa.sourceUrl===AREA_URL&&nasa.indexUrl===INDEX_URL&&nasa.sourceSha256===NASA_SHA&&
       [nasa.indexSha256,nasa.clauseSha256,nasa.candidateSha256,nasa.evidenceSha256,nasa.freezeSha256,nasa.gradeSha256].every(hex)&&
       nasa.modelCalls===0&&nasa.modelTrainingPerformed===false&&nasa.activationAuthorized===false&&nasa.productionDeploymentAllowed===false))
   return noReceipt(1,'رسید اجرای مستقیم قبلی ناسا برای همین نسخهٔ منبع پیدا یا تأیید نشد. هیچ منبع یا رسید دیگری جایگزین نشد.');
  return {...SAFE,status:'AWAITING_HUMAN_REVIEW',caseId:AEC_CASE,missionId:AEC_ID,title,validatedCount:2,nextCaseId:null,
   selectedBecause:'برای همان ردیف مترهٔ صف سند، مانا مدرک اجرای مستقیم قبلی ناسا را انتخاب کرد چون با همین نسخهٔ منبع و رسید مستقل ۱۶ از ۱۶ تطبیق دارد. رسید قبلی پایتون نیز معتبر است. این بررسی هیچ دریافت تازه یا اجرای دوبارهٔ مأموریت ندارد.',
   sourceUrl:nasa.sourceUrl,indexUrl:nasa.indexUrl,sourceMode:nasa.sourceMode,sourceSha256:nasa.sourceSha256,indexSha256:nasa.indexSha256,
   evidenceSha256:nasa.evidenceSha256,gradeSha256:nasa.gradeSha256,candidateSha256:nasa.candidateSha256,
   passed:nasa.passed,total:nasa.total,
   completed:[{missionId:RESEARCH_MISSION_ID,title:cpyTitle,passed:cp.passed,total:cp.total},
    {missionId:AEC_ID,title,passed:nasa.passed,total:nasa.total}],
  };
 }
 return {history:inspect,run(instruction){
  if(!supportsMissionSelectionInstruction(instruction))return {...SAFE,status:'REJECTED'};
  return inspect();
 }};
}
function openReceiptReview({cpythonWorkspace,masterPath,nasaWorkspace,pythonPath}={}){
 need([cpythonWorkspace,masterPath,nasaWorkspace,pythonPath].every(abs),'RECEIPT_ABSOLUTE_INPUTS_REQUIRED');
 const app=path.resolve(__dirname,'..'),states=[cpythonWorkspace,nasaWorkspace];
 need(!nested(cpythonWorkspace,nasaWorkspace)&&!nested(nasaWorkspace,cpythonWorkspace)&&
  states.every(s=>!nested(s,app)&&!nested(app,s)&&!nested(masterPath,s)&&!nested(pythonPath,s)&&cleanDir(s))&&
  fs.realpathSync(masterPath)===masterPath,'RECEIPT_DISTINCT_EXISTING_DIRECTORIES_REQUIRED');
 const masterBytes=readBound(masterPath,128*1024);
 const queueBytes=readBound(path.resolve(__dirname,'../capability-registry/development-queue-v01.json'),128*1024);
 const cpy=createQueueResearchRunner({queueBytes,workspace:cpythonWorkspace,holdoutPath:path.join(__dirname,'holdout.json'),
  holdoutSha256:HOLDOUT_SHA256,sourceMode:'official-https',readOfficial:()=>{throw Error('RECEIPT_REVIEW_NO_NETWORK');}});
 const nasa=createNasaAreaExperiment({workspace:nasaWorkspace,mode:'direct',pythonPath,
  request:()=>{throw Error('RECEIPT_REVIEW_NO_NETWORK');}});
 return createReceiptReviewRunner({queueBytes,masterBytes,readCpython:cpy.review,readNasa:nasa.history});
}
if(require.main===module){
 const [cpythonWorkspace,masterPath,nasaWorkspace,pythonPath,...extra]=process.argv.slice(2);
 try{
  need(!extra.length,'RECEIPT_ABSOLUTE_INPUTS_REQUIRED');
  const runner=openReceiptReview({cpythonWorkspace,masterPath,nasaWorkspace,pythonPath});
  const server=start({port:Number(process.env.MANA_MISSION_SELECTION_PORT??0),runner,missionSelection:true,receiptReview:true});
  server.once('listening',()=>console.log('MANA receipt review: http://127.0.0.1:'+server.address().port));
  server.once('error',()=>{console.error('MANA_RECEIPT_PREVIEW_LISTEN_FAILED');process.exitCode=1;});
  for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>server.close());
 }catch{
  console.error('MANA_RECEIPT_PREVIEW_LOCAL_INPUTS_OR_STATE_UNVERIFIED');
  process.exitCode=1;
 }
}
module.exports={createReceiptReviewRunner,openReceiptReview};
