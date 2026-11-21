'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const VERSION='MANA_FMA_UI_BRIDGE_V1';
const WORKER=path.resolve(__dirname,'.');
const PINS=Object.freeze({
 'run.cjs':'fdaaa94105f8b9a3b8cf20d91cca45983b37d806bc4495c8cf67d48c9dfbaa7a',
 'source.cjs':'6fcb90096c7639679764224f9fbd2fa53f2b38676421cc8c14246ea1ed99c685',
 '../native-rd-pilot/native-synth.cjs':'30fc3b1b5121ee61d6a86ef1ae83e223d2f5b58f547fb4dad4a4804016e1ddf6',
 '../native-rd-pilot/permission-launch.cjs':'4e5ff093f24663056604fa04be773944bc3c0e78dba3e64ae7e4ef5a5d74852a',
 '../src/native/skill-expression.cjs':'1241583c48b400833938799ea5538a7585cd8862444c930fea0b580741829261',
});
const MISSION=Object.freeze({
 missionId:'python-math-fma-exact-small-integer-projection',
 title:'آزمایش ساخت قاعدهٔ ضرب و جمع در دامنهٔ اعداد صحیح',
 selectionReason:'این تنها مأموریت فعال این پایلوت است: ساخت یک قاعدهٔ محدود از مستند رسمی پایتون ۳٫۱۳ و آزمون مستقل؛ نه تعمیم به محاسبات اعشاری پایتون.',
 sourceUrl:'https://docs.python.org/3.13/library/math.html#math.fma',modelCalls:0,activationAuthorized:false
});
const ok=(n,s)=>{if(!n)throw Error(s);};
const sha=x=>createHash('sha256').update(x).digest('hex');
const digest=x=>sha(JSON.stringify(x));
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const abs=x=>typeof x==='string'&&x.length<4096&&path.isAbsolute(x)&&path.resolve(x)===x&&!x.includes('\0');
function read(file,limit=256*1024) {
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try {
  const s=fs.fstatSync(fd);ok(s.isFile()&&s.size>0&&s.size<=limit,'FILE_REJECTED');
  const b=Buffer.alloc(s.size+1);let n=0;
  while(n<b.length){const got=fs.readSync(fd,b,n,b.length-n,null);if(!got)break;n+=got;}
  ok(n===s.size,'FILE_CHANGED');return b.subarray(0,n);
 }finally{fs.closeSync(fd);}
}
const parsed=b=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
function readOptional(file){
 try{return read(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
function identify(dir){
 ok(fs.realpathSync(dir)===dir,'WORKSPACE_NOT_CANONICAL');
 const st=fs.lstatSync(dir);
 ok(st.isDirectory()&&st.uid===process.getuid()&&(st.mode&0o077)===0,'WORKSPACE_NOT_PRIVATE');
 return {path:dir,dev:st.dev,ino:st.ino};
}
function syncDir(dir){const fd=fs.openSync(dir,fs.constants.O_DIRECTORY|fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function write(dir,name,content){
 const file=path.join(dir,name);
 const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,content);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 syncDir(dir);return file;
}
const rec=(dir,name,r)=>write(dir,name,JSON.stringify(r)+'\n');
function sealed(body,key){return {...body,[key]:digest(body)};}
function openSeal(b,key){
 const all=parsed(b);
 ok(all&&typeof all==='object'&&!Array.isArray(all),'CORRUPT_RECORD');
 const {[key]:seal,...body}=all;ok(hex(seal)&&digest(body)===seal,'CORRUPT_RECORD');
 return all;
}
function view(status,more={}){
 return {...MISSION,status,heldoutPassed:null,heldoutTotal:null,candidateSha256:null,replayed:false,...more};
}
function freezeInfo(work,sourceSha256){
 const f=readOptional(path.join(work,'frozen.json'));
 if(!f)return null;
 const freeze=openSeal(f,'freezeSha256');
 const claim=openSeal(read(path.join(work,'claim.json')),'claimSha256');
 const learnerIdentity=identify(work);
 ok(claim.identity.root===learnerIdentity.path&&claim.identity.dev===learnerIdentity.dev&&claim.identity.ino===learnerIdentity.ino&&sha(read(path.join(work,'fit-only.json')))===freeze.fitFileSha,'FOREIGN_OR_CHANGED_LEARNER_STATE');
 ok(freeze.schema==='MANA_RESEARCH_NATIVE_FREEZE_V1'&&claim.schema==='MANA_RESEARCH_NATIVE_CLAIM_V1'&&claim.captureFileSha256===sourceSha256&&freeze.claimSha256===claim.claimSha256&&freeze.sourceDocumentSha256===claim.source.documentSha256&&freeze.workerSha256===PINS['../native-rd-pilot/native-synth.cjs']&&freeze.activationAuthorized===false&&freeze.modelCalls===0,'FOREIGN_FREEZE');
 ok(freeze.status==='CANDIDATE_FROZEN_FOR_INDEPENDENT_TESTS'||freeze.status==='NO_REVIEWABLE_CANDIDATE','FOREIGN_FREEZE_STATUS');
 if(freeze.status==='CANDIDATE_FROZEN_FOR_INDEPENDENT_TESTS')ok(hex(freeze.candidateSha256)&&digest(freeze.candidate)===freeze.candidateSha256&&freeze.search.truncated===false&&freeze.search.matchedBehaviorClasses===1,'CORRUPT_CANDIDATE');
 return freeze;
}
function gradeInfo(work,freeze,holdoutSha256){
 const file=readOptional(path.join(work,'grade.json'));if(!file)return null;
 const g=openSeal(file,'gradeSha256');
 const {heldoutPassed:p,heldoutTotal:t}=g;
 ok(g.schema==='MANA_RESEARCH_NATIVE_GRADE_V1'&&g.freezeSha256===freeze.freezeSha256&&g.candidateSha256===freeze.candidateSha256&&g.sourceDocumentSha256===freeze.sourceDocumentSha256&&g.holdoutFileSha256===holdoutSha256&&g.evaluatorSha256===PINS['../src/native/skill-expression.cjs']&&g.activationAuthorized===false&&g.modelCalls===0&&Number.isInteger(p)&&Number.isInteger(t)&&t>=8&&t<=64&&p>=0&&p<=t&&g.status===(p===t?'HELDOUT_PASSED_REVIEW_REQUIRED':'HELDOUT_FAILED'),'FOREIGN_GRADE');
 return g;
}
function inspectOrRun(opts,readOnly) {
 let lock=false,workspace;
 try {
  const {workspace:dir,sourcePath,sourceSha256,holdoutPath,holdoutSha256}=opts||{};
  ok([dir,sourcePath,holdoutPath].every(abs)&&hex(sourceSha256)&&hex(holdoutSha256),'HOST_CONFIG_INVALID');
  ok(![sourcePath,holdoutPath].some(f=>f===dir||f.startsWith(dir+'/')),'ARTIFACTS_MUST_BE_OUTSIDE_STATE');
  const identity=identify(dir);workspace=dir;
  const inputs={schema:VERSION,missionId:MISSION.missionId,identity,sourceSha256,holdoutSha256,bridgeSha256:sha(read(__filename)),pins:PINS};
  const claimPath=path.join(dir,'bridge-claim.json'), donePath=path.join(dir,'bridge-result.json'), work=path.join(dir,'learner');
  const seal=sealed(inputs,'bridgeClaimSha256');
  const loadClaim=b=>{
   const x=openSeal(b,'bridgeClaimSha256');ok(x.bridgeClaimSha256===seal.bridgeClaimSha256,'FOREIGN_OR_STALE_MISSION');return x;
  };
  const snapshot=(freeze,grade)=>({
   sourceDocumentSha256:freeze.sourceDocumentSha256,sourceCaptureSha256:sourceSha256,candidateSha256:freeze.candidateSha256,
   nativeReceiptSha256:freeze.freezeSha256,gradeReceiptSha256:grade?.gradeSha256??null,
   heldoutPassed:grade?.heldoutPassed??null,heldoutTotal:grade?.heldoutTotal??null,
  });
  const getFinal=(g,f)=>{
   if(f.status==='NO_REVIEWABLE_CANDIDATE')return {status:'NO_REVIEWABLE_CANDIDATE',...snapshot(f,null)};
   if(!g)return null;
   return {status:g.heldoutPassed===g.heldoutTotal?'AWAITING_HUMAN_REVIEW':'TEST_FAILED',...snapshot(f,g)};
  };
  const original=readOptional(donePath);
  if(original){
   loadClaim(read(claimPath));
   const f=freezeInfo(work,sourceSha256);ok(f,'MISSING_FROZEN_RESULT');
   const final=getFinal(gradeInfo(work,f,holdoutSha256),f);ok(final,'MISSING_GRADED_RESULT');
   const receipt=openSeal(original,'bridgeReceiptSha256');
   ok(receipt.bridgeClaimSha256===seal.bridgeClaimSha256&&digest(receipt.result)===digest(final),'FOREIGN_MISSION_RESULT');
   const result=view(final.status,{...final,bridgeReceiptSha256:receipt.bridgeReceiptSha256,replayed:true});
   return readOnly?[result]:result;
  }
  if(readOnly){
   const prior=readOptional(claimPath);
   if(prior){loadClaim(prior);freezeInfo(work,sourceSha256);}
   else ok(fs.readdirSync(dir).every(n=>n==='bridge-lock.json'),'UNEXPECTED_INITIAL_STATE');
   return [];
  }
  try{rec(dir,'bridge-lock.json',{pid:process.pid,bridgeClaimSha256:seal.bridgeClaimSha256});lock=true;}
  catch(e){if(e.code==='EEXIST')return view('UNKNOWN_INTERRUPTED',{reason:'IN_PROGRESS_OR_INTERRUPTED'});throw e;}
  ok(digest(identify(dir))===digest(identity),'WORKSPACE_CHANGED');
  // If a competing caller finished before our lock, it is safe (and cheapest) to read next time.
  if(readOptional(donePath))return view('UNKNOWN_INTERRUPTED',{reason:'COMPLETED_DURING_CALL'});
  for(const [file,pin] of Object.entries(PINS)){
   const target=path.join(WORKER,file);ok(fs.realpathSync(target)===target&&sha(read(target))===pin,'PINNED_LEARNER_CHANGED');
  }
  const native=require(path.join(WORKER,'run.cjs'));
  const old=readOptional(claimPath);
  let freeze;
  if(old){
   loadClaim(old);
   try{freeze=freezeInfo(work,sourceSha256);}catch{return view('UNKNOWN_INTERRUPTED',{reason:'INCOMPLETE_NATIVE_FREEZE'});}
   if(!freeze)return view('UNKNOWN_INTERRUPTED',{reason:'CLAIM_WITHOUT_FROZEN_RESULT'});
  }else{
   ok(fs.readdirSync(dir).every(f=>f==='bridge-lock.json'),'UNEXPECTED_INITIAL_STATE');
   const source=readOptional(sourcePath);
   if(!source)return view('MISSING_SOURCE',{reason:'CAPTURE_NOT_PRESENT'});
   ok(sha(source)===sourceSha256,'SOURCE_BYTE_PIN_MISMATCH');
   // Fail before claiming on unsupported meaning/version.
   try{require(path.join(WORKER,'source.cjs')).derive(parsed(source));}
   catch{return view('BLOCKED_EVIDENCE',{reason:'SOURCE_RELATION_NOT_VERIFIED'});}
   if(Number(process.versions.node.split('.')[0])<24)return view('BLOCKED_EVIDENCE',{reason:'NODE24_REQUIRED'});
   rec(dir,'bridge-claim.json',seal);
   fs.mkdirSync(work,0o700);syncDir(dir);
   const copy=write(dir,'source-capture.json',source);
   try{native.synthesize(copy,work);freeze=freezeInfo(work,sourceSha256);}
   catch{return view('UNKNOWN_INTERRUPTED',{reason:'SYNTHESIS_OUTCOME_UNKNOWN'});}
   if(!freeze)return view('UNKNOWN_INTERRUPTED',{reason:'CLAIM_WITHOUT_FROZEN_RESULT'});
  }
  let finished=getFinal(gradeInfo(work,freeze,holdoutSha256),freeze);
  if(!finished){
   if(readOptional(path.join(dir,'grade-dispatch.json')))return view('UNKNOWN_INTERRUPTED',{...snapshot(freeze,null),reason:'GRADE_OUTCOME_UNKNOWN'});
   // Deliberately no read/open of the oracle until after the candidate is frozen.
   const oracle=readOptional(holdoutPath);
   if(!oracle)return view('MISSING_TEST_EVIDENCE',{...snapshot(freeze,null),reason:'ORACLE_NOT_PRESENT'});
   if(sha(oracle)!==holdoutSha256)return view('BLOCKED_EVIDENCE',{...snapshot(freeze,null),reason:'HOLDOUT_BYTE_PIN_MISMATCH'});
   rec(dir,'grade-dispatch.json',{bridgeClaimSha256:seal.bridgeClaimSha256,freezeSha256:freeze.freezeSha256,holdoutSha256});
   try{
    native.grade(work,holdoutPath,holdoutSha256);
    finished=getFinal(gradeInfo(work,freeze,holdoutSha256),freeze);
   }catch{return view('UNKNOWN_INTERRUPTED',{...snapshot(freeze,null),reason:'GRADE_OUTCOME_UNKNOWN'});}
   if(!finished)return view('UNKNOWN_INTERRUPTED',{...snapshot(freeze,null),reason:'GRADE_OUTCOME_UNKNOWN'});
  }
  const receipt=sealed({bridgeClaimSha256:seal.bridgeClaimSha256,result:finished},'bridgeReceiptSha256');
  rec(dir,'bridge-result.json',receipt);
  return view(finished.status,{...finished,bridgeReceiptSha256:receipt.bridgeReceiptSha256});
 }catch(e){
  if(readOnly)throw Error('LOCAL_EVIDENCE_INVALID_OR_STATE_CORRUPT');
  const known=new Set(['HOST_CONFIG_INVALID','ARTIFACTS_MUST_BE_OUTSIDE_STATE','WORKSPACE_NOT_CANONICAL','WORKSPACE_NOT_PRIVATE','SOURCE_BYTE_PIN_MISMATCH','FOREIGN_OR_STALE_MISSION','PINNED_LEARNER_CHANGED','UNEXPECTED_INITIAL_STATE']);
  return view('BLOCKED_EVIDENCE',{reason:known.has(e.message)?e.message:'LOCAL_EVIDENCE_INVALID_OR_STATE_CORRUPT'});
 }finally{
  if(lock){try{fs.unlinkSync(path.join(workspace,'bridge-lock.json'));syncDir(workspace);}catch{}}
 }
}
const runFmaMission=opts=>inspectOrRun(opts,false);
const readFmaMissionHistory=opts=>inspectOrRun(opts,true);
if(require.main===module){
 const [workspace,sourcePath,sourceSha256,holdoutPath,holdoutSha256,...rest]=process.argv.slice(2);
 const out=runFmaMission(rest.length?null:{workspace,sourcePath,sourceSha256,holdoutPath,holdoutSha256});
 console.log(JSON.stringify(out,null,2));
 if(!['AWAITING_HUMAN_REVIEW','TEST_FAILED','NO_REVIEWABLE_CANDIDATE'].includes(out.status))process.exitCode=1;
}
module.exports={runFmaMission,readFmaMissionHistory};
