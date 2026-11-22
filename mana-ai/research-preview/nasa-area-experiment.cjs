'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {createReceiptStore}=require('./receipt.cjs');
const {learnAec,readAecLearning}=require('./aec-learner.cjs');
const {INDEX_URL,AREA_URL,PROFILES,SCOPE,discoverNasaArea,rawReplayReader,scopeDiagnostic}=require('./nasa-area-source.cjs');
const {ID}=require('./aec-source.cjs');
const SLOT='nasa-gross-planar-trapezoid-experiment-v1';
const SAFETY=Object.freeze({scope:SCOPE,activationAuthorized:false,productionDeploymentAllowed:false,modelCalls:0,modelTrainingPerformed:false});
const SOURCE_STAGES=new Set(['index','selected-link','source-setup']);
const SOURCE_FAULTS=new Set([
 'NASA_HTTPS_TIMEOUT','NASA_HTTPS_REQUEST_FAILED','NASA_HTTPS_STATUS_REJECTED','NASA_HTTPS_MEDIA_REJECTED','NASA_HTTPS_BODY_REJECTED','NASA_HTTPS_INCOMPLETE',
 'NASA_CAPTURE_PIN_MISMATCH','NASA_CAPTURE_PATH_OR_PIN_REJECTED','NASA_CAPTURE_FILE_REJECTED','NASA_CAPTURE_FILE_CHANGED',
 'NASA_AREA_LINK_NOT_APPROVED','NASA_AREA_LINK_MISSING_OR_AMBIGUOUS','NASA_LINK_MALFORMED',
 'NASA_TRAPEZOID_CLAUSE_MISSING_OR_AMBIGUOUS','NASA_TRAPEZOID_CLAUSE_NOT_SUPPORTED','NASA_PLANAR_SCOPE_NOT_VERIFIED','NASA_PLANAR_EVIDENCE_SHAPE_INVALID','NASA_PLANAR_PRECEDING_EVIDENCE_MISSING',
 'NASA_PLANAR_PARAGRAPH_PREFIX_MISSING','NASA_PLANAR_FORBIDDEN_SCOPE','NASA_FORMULA_ROLE_OR_PROSE_MISMATCH',
 'NASA_WRONG_LESSON','NASA_EXTRACTOR_TIMEOUT','NASA_EXTRACTOR_START_OR_OUTPUT_FAILED','NASA_HTML_BYTES_REJECTED','NASA_MARKUP_INVALID','NASA_MARKUP_BUDGET','NASA_INLINE_STYLESHEET_UNSUPPORTED','NASA_EXTRACTION_FAILED',
 'NASA_SOURCE_UNVERIFIED',
]);
const sha=x=>createHash('sha256').update(x).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const abs=p=>typeof p==='string'&&p.length<4096&&!p.includes('\0')&&path.isAbsolute(p)&&path.resolve(p)===p;
const need=(ok,code)=>{if(!ok)throw Error(code);};
function evidenceBytes(file){
 const c=fs.constants;
 const fd=fs.openSync(file,c.O_RDONLY|c.O_NOFOLLOW|c.O_NONBLOCK);
 try{
  const s=fs.fstatSync(fd);need(s.isFile()&&s.uid===process.getuid()&&(s.mode&0o7777)===0o600&&s.nlink===1&&s.size>0&&s.size<=64*1024,'NASA_EVIDENCE_FILE_REJECTED');
  const b=Buffer.alloc(s.size+1);let off=0;
  while(off<b.length){const n=fs.readSync(fd,b,off,b.length-off,null);if(!n)break;off+=n;}
  need(off===s.size,'NASA_EVIDENCE_FILE_CHANGED');return b.subarray(0,off);
 }finally{fs.closeSync(fd);}
}
const decode=b=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
function syncDir(directory){
 const c=fs.constants,fd=fs.openSync(directory,c.O_RDONLY|c.O_DIRECTORY|c.O_NOFOLLOW);
 try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function createNasaAreaExperiment({workspace,mode,pythonPath,captureDir,indexSha256,areaSha256,request}={}){
 need(abs(workspace)&&abs(pythonPath)&&Object.hasOwn(PROFILES,mode),'NASA_EXPERIMENT_INPUT_INVALID');
 const app=path.resolve(__dirname,'..'),nested=(x,y)=>x===y||x.startsWith(y+path.sep);
 need(!nested(workspace,app)&&!nested(app,workspace)&&!nested(pythonPath,workspace),'NASA_WORKSPACE_MUST_BE_SEPARATE');
 const replay=mode==='pinned-capture';
 need(replay?abs(captureDir)&&!nested(captureDir,workspace)&&!nested(workspace,captureDir)&&hex(indexSha256)&&hex(areaSha256)&&request===undefined:
  [captureDir,indexSha256,areaSha256].every(v=>v===undefined),'NASA_EXACT_SOURCE_MODE_REQUIRED');
 const pinned=replay?{indexSha256,areaSha256}:null;
 // No reads of publisher evidence or network access before the durable claim.
 const implementation=Object.fromEntries(['nasa-area-experiment.cjs','nasa-area-source.cjs','nasa-area-html.py']
  .map(n=>[n,sha(fs.readFileSync(path.join(__dirname,n)))]));
 const store=createReceiptStore({workspace,slot:{id:SLOT,version:1,mode,pinned,task:ID,implementation}});
 const file=path.join(workspace,'source.json'),learner=path.join(workspace,'learner');
 const render=(r,reused=false)=>({...SAFETY,experimentId:SLOT,sourceMode:mode,transport:PROFILES[mode],reused,...r});
 const checkEvidence=e=>{
  const capture=(r,url)=>r?.url===url&&hex(r.sha256)&&Number.isSafeInteger(r.byteCount)&&r.byteCount>=1&&r.byteCount<=384*1024&&
   (replay?r.retrievedAt===null:typeof r.retrievedAt==='string'&&Number.isFinite(Date.parse(r.retrievedAt)));
  need(e?.schema==='MANA_NASA_AREA_EVIDENCE_V1'&&e.sourceMode===mode&&e.transport===PROFILES[mode]&&e.scope===SCOPE&&
   e.captureRepresentation==='RAW_HTML'&&e.visibilityAssessment==='STATIC_HTML_PROFILE_NOT_BROWSER_RENDERING'&&
   capture(e.index,INDEX_URL)&&capture(e.source,AREA_URL)&&e.link?.url===AREA_URL&&e.link.label==='Area'&&e.link.section==='Math Fundamentals'&&
   typeof e.link.href==='string'&&new URL(e.link.href,INDEX_URL).href===AREA_URL&&Number.isSafeInteger(e.link.line)&&e.link.line>0&&
   hex(e.planar?.clauseSha256)&&e.planar.output?.numerator==='twice_area'&&e.planar.output.denominator===2&&e.planar.output.unit==='mm²'&&
   e.fit?.id===ID&&(!pinned||e.index.sha256===indexSha256&&e.source.sha256===areaSha256),'NASA_EVIDENCE_PROVENANCE_MISMATCH');
  return e;
 };
 function grade(g){
  need(g&&g.activationAuthorized===false&&g.modelCalls===0&&hex(g.freezeSha256)&&hex(g.gradeSha256)&&
   Number.isInteger(g.total)&&g.total===16&&Number.isInteger(g.passed)&&g.passed>=0&&g.passed<=g.total&&
   (g.candidateSha256===null||hex(g.candidateSha256)),'NASA_GRADE_INVALID');
  const accepted=g.status==='AWAITING_HUMAN_REVIEW';
  need(accepted?g.testsRun===16&&g.passed===16&&hex(g.candidateSha256):g.passed<16,'NASA_GRADE_VERDICT_INVALID');
  return {status:accepted?'AWAITING_HUMAN_REVIEW':'TEST_NOT_PASSED',passed:g.passed,total:g.total,testsRun:g.testsRun,
   candidateSha256:g.candidateSha256,freezeSha256:g.freezeSha256,gradeSha256:g.gradeSha256};
 }
 const metadata=e=>({sourceUrl:AREA_URL,indexUrl:INDEX_URL,indexSha256:e.index.sha256,sourceSha256:e.source.sha256,clauseSha256:e.planar.clauseSha256});
 function validate(r){
  if(r.status==='SOURCE_BLOCKED'){
   for(const target of [file,learner])try{fs.lstatSync(target);throw Error('NASA_UNEXPECTED_SOURCE_ARTIFACT');}catch(e){if(e.code!=='ENOENT')throw e;}
   need(SOURCE_FAULTS.has(r.sourceFailureCode)&&SOURCE_STAGES.has(r.sourceFailureStage),'NASA_INVALID_SOURCE_FAILURE');
   if(Object.hasOwn(r,'scopeDiagnostics'))need(r.sourceFailureStage==='selected-link'&&
    scopeDiagnostic(r.sourceFailureCode,r.scopeDiagnostics),'NASA_INVALID_SCOPE_DIAGNOSTICS');
  }else{
   const bytes=evidenceBytes(file);
   need(hex(r.evidenceSha256)&&r.evidenceSha256===sha(bytes),'NASA_RECEIPT_EVIDENCE_MISMATCH');
   const e=checkEvidence(decode(bytes));
   const expected={...grade(readAecLearning({workspace:learner,fit:e.fit,evidenceSha256:r.evidenceSha256})),...metadata(e)};
   need(Object.entries(expected).every(([k,v])=>r[k]===v),'NASA_LEARNER_RECEIPT_MISMATCH');
  }
  return r;
 }
 const review=r=>render(validate(r),true);
 return {
  history(){
   const v=store.read();
   return v.state==='EMPTY'?null:v.state==='TERMINAL'?review(v.result):render({status:'UNKNOWN_OUTCOME'});
  },
  async run(){
   const observed=store.read();
   if(observed.state==='EMPTY')need(fs.readdirSync(workspace).length===0,'NASA_FRESH_EXPERIMENT_WORKSPACE_REQUIRED');
   const ticket=store.claim();
   if(ticket.state==='TERMINAL')return review(ticket.result);
   if(ticket.state!=='CLAIMED')return render({status:'UNKNOWN_OUTCOME'});
   let e;
   try{
    const reader=replay?rawReplayReader(captureDir,indexSha256,areaSha256):undefined;
    e=checkEvidence(await discoverNasaArea({mode,pythonPath,reader,request}));
   }catch(error){
    const r={status:'SOURCE_BLOCKED',sourceFailureCode:SOURCE_FAULTS.has(error?.message)?error.message:'NASA_SOURCE_UNVERIFIED',
     sourceFailureStage:SOURCE_STAGES.has(error?.sourceStage)?error.sourceStage:'source-setup'};
    if(r.sourceFailureStage==='selected-link'&&scopeDiagnostic(r.sourceFailureCode,error?.scopeDiagnostics))
     r.scopeDiagnostics={...error.scopeDiagnostics};
    validate(r);ticket.commit(r);return render(r);
   }
   const bytes=Buffer.from(JSON.stringify(e)+'\n'),evidenceSha256=sha(bytes);
   need(bytes.length<=64*1024,'NASA_EVIDENCE_TOO_LARGE');
   const c=fs.constants,fd=fs.openSync(file,c.O_WRONLY|c.O_CREAT|c.O_EXCL|c.O_NOFOLLOW,0o600);
   try{fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   fs.mkdirSync(learner,{mode:0o700});syncDir(workspace);
   const g=learnAec({workspace:learner,fit:e.fit,evidenceSha256});
   const r={...grade(g),...metadata(e),evidenceSha256};
   validate(r);ticket.commit(r);return render(r);
  },
 };
}
if(require.main===module){
 const [workspace,flag,pythonPath,captureDir,indexSha256,areaSha256,...rest]=process.argv.slice(2);
 (async()=>{
  const mode=flag==='--direct'?'direct':flag==='--pinned-capture'?'pinned-capture':null;
  need(mode&&!rest.length,'NASA_EXPERIMENT_INPUT_INVALID');
  const r=await createNasaAreaExperiment({workspace,mode,pythonPath,captureDir,indexSha256,areaSha256}).run();
  console.log(JSON.stringify(r));
  if(r.status!=='AWAITING_HUMAN_REVIEW')process.exitCode=1;
 })().catch(error=>{
  const allow=new Set(['NASA_EXPERIMENT_INPUT_INVALID','NASA_WORKSPACE_MUST_BE_SEPARATE','NASA_EXACT_SOURCE_MODE_REQUIRED','NASA_FRESH_EXPERIMENT_WORKSPACE_REQUIRED','PRIVATE_WORKSPACE_REQUIRED','RECEIPT_NEEDS_NODE_24']);
  console.log(JSON.stringify({...SAFETY,status:'ABSTAIN',reasonCode:allow.has(error?.message)?error.message:'NASA_EXPERIMENT_STATE_NOT_VERIFIED'}));
  process.exitCode=1;
 });
}
module.exports={createNasaAreaExperiment};
