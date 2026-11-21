'use strict';
// Reviewed offline integer task. Neither the publisher source nor oracle is readable by the learner.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {createReceiptStore}=require('./receipt.cjs');
const {parseExactJSON}=require('../src/exact-json.cjs');
const {payloadDigest}=require('../src/approval-store.cjs');
const FILES=Object.freeze({
 worker:[require.resolve('../native-rd-pilot/native-synth.cjs'),'30fc3b1b5121ee61d6a86ef1ae83e223d2f5b58f547fb4dad4a4804016e1ddf6'],
 launcher:[require.resolve('../native-rd-pilot/permission-launch.cjs'),'4e5ff093f24663056604fa04be773944bc3c0e78dba3e64ae7e4ef5a5d74852a'],
 evaluator:[require.resolve('../src/native/skill-expression.cjs'),'1241583c48b400833938799ea5538a7585cd8862444c930fea0b580741829261'],
 oracle:[require.resolve('./aec-learner-oracle.cjs'),'687309fb65aaa43d6ae4c7079e3a79f4a86dbc508dc58335d8ce4a4df82bc791'],
});
const TASK='trapezoid-panel-area-twice-mm2',FIELDS=['base_a_mm','base_b_mm','height_mm'];
const OPS=['add','subtract','multiply','min','max'],MAX=100000,LIMIT=1e12,TOTAL=16;
const C=fs.constants,sha=x=>createHash('sha256').update(x).digest('hex');
const hash=x=>sha(JSON.stringify(x)),equal=(a,b)=>payloadDigest(a)===payloadDigest(b);
const need=(x,err)=>{if(!x)throw Error(err);},hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const decode=b=>parseExactJSON(new TextDecoder('utf-8',{fatal:true}).decode(b));
function read(file,limit=65536,privateFile=false){
 need(fs.realpathSync(file)===file,'AEC_CANONICAL_FILE_REQUIRED');
 const fd=fs.openSync(file,C.O_RDONLY|C.O_NOFOLLOW|C.O_NONBLOCK);
 try{
  const st=fs.fstatSync(fd);
  need(st.isFile()&&st.size>0&&st.size<=limit&&(!privateFile||(st.mode&0o777)===0o600&&st.uid===process.getuid()&&st.nlink===1),'AEC_INVALID_LOCAL_FILE');
  const b=Buffer.alloc(st.size+1);let off=0;
  while(off<b.length){const n=fs.readSync(fd,b,off,b.length-off,null);if(!n)break;off+=n;}
  need(off===st.size,'AEC_LOCAL_FILE_CHANGED');
  return b.subarray(0,off);
 }finally{fs.closeSync(fd);}
}
function pin([file,digest]){
 need(sha(read(file))===digest,'AEC_PINNED_MODULE_CHANGED');
 return file;
}
function isVec(row){return Array.isArray(row)&&row.length===FIELDS.length&&FIELDS.every((_,i)=>Object.hasOwn(row,i)&&Number.isSafeInteger(row[i])&&row[i]>=1&&row[i]<=MAX);}
function entries(o,k){return o!==null&&typeof o==='object'&&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null)&&Object.keys(o).sort().join(',')===k.slice().sort().join(',');}
function fitPack(fit){
 need(entries(fit,['schema','id','fields','outputPower','examples'])&&fit.schema==='MANA_INTEGER_EXAMPLES_V1'&&fit.id===TASK&&fit.outputPower===2,'AEC_FIT_POLICY_MISMATCH');
 const fields=FIELDS.map(id=>({id,power:1,max:MAX}));
 need(equal(fit.fields,fields)&&Array.isArray(fit.examples)&&fit.examples.length>=8&&fit.examples.length<=32,'AEC_FIT_POLICY_MISMATCH');
 const seen=new Set();
 const examples=Array.from(fit.examples,pair=>{
  need(Array.isArray(pair)&&pair.length===2,'AEC_INVALID_FIT_ROW');
  const [input,expected]=pair;
  need(isVec(input)&&Number.isSafeInteger(expected)&&!Object.is(expected,-0)&&expected>=0&&expected<=LIMIT&&!seen.has(input.join(',')),'AEC_INVALID_OR_CONFLICTING_FIT_ROW');
  seen.add(input.join(','));
  return [[...input],expected];
 });
 return {schema:fit.schema,id:TASK,fields,outputPower:2,examples};
}
function put(workspace,name,bytes){
 const fd=fs.openSync(path.join(workspace,name),C.O_WRONLY|C.O_EXCL|C.O_CREAT|C.O_NOFOLLOW,0o600);
 try{fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 const dir=fs.openSync(workspace,C.O_RDONLY|C.O_DIRECTORY|C.O_NOFOLLOW);
 try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
}
function prepare({workspace,fit,evidenceSha256}={}){
 need(typeof workspace==='string'&&path.isAbsolute(workspace)&&path.resolve(workspace)===workspace&&!/[*,\n\r]/u.test(workspace)&&hex(evidenceSha256),'AEC_PRIVATE_WORKSPACE_AND_EVIDENCE_REQUIRED');
 const application=path.resolve(__dirname,'..');
 need(workspace!==application&&!workspace.startsWith(application+path.sep)&&!application.startsWith(workspace+path.sep),'AEC_WORKSPACE_MUST_BE_SEPARATE');
 const pack=fitPack(fit),fitBytes=Buffer.from(JSON.stringify(pack)+'\n');
 const fitFileSha256=sha(fitBytes),fitPath=path.join(workspace,'fit-only.json'),freezePath=path.join(workspace,'frozen.json');
 const store=createReceiptStore({workspace,slot:{id:TASK,evidenceSha256,fitFileSha256,learnerSha256:sha(read(__filename)),workerSha256:FILES.worker[1],launcherSha256:FILES.launcher[1],evaluatorSha256:FILES.evaluator[1],oracleSha256:FILES.oracle[1]}});
 return {workspace,store,pack,fitBytes,fitPath,fitFileSha256,freezePath,evidenceSha256};
}
function runWorker(context){
 const worker=pin(FILES.worker),launcher=pin(FILES.launcher),fitPath=context.fitPath;
 const allowed=[launcher,worker,fitPath];
 need(!allowed.some(p=>/[*,\n\r]/u.test(p)),'AEC_UNSAFE_PERMISSION_PATH');
 const args=['--permission',...allowed.map(p=>'--allow-fs-read='+p),launcher,worker,FILES.worker[1],fitPath,context.fitFileSha256];
 const r=spawnSync(process.execPath,args,{cwd:context.workspace,env:{},stdio:['ignore','pipe','pipe'],timeout:14000,maxBuffer:16384,killSignal:'SIGKILL'});
 need(r.status===0&&r.signal===null&&!r.error&&Buffer.isBuffer(r.stdout)&&r.stdout.length>0,'AEC_WORKER_OUTCOME_UNKNOWN_NO_RETRY');
 return decode(r.stdout);
}
function resultKind(result,context){
 const r=result,s=r?.search;
 need(r?.schema==='MANA_NATIVE_SYNTHESIS_RESULT_V1'&&r.task===TASK&&r.workerSha256===FILES.worker[1]&&r.trainingFileSha256===context.fitFileSha256&&r.trainingSha256===hash(context.pack)&&r.trainingExampleCount===context.pack.examples.length&&r.outputPower===2&&equal(r.fields,context.pack.fields)&&r.modelCalls===0&&r.activationAuthorized===false&&r.modelTrainingPerformed===false,'AEC_UNVERIFIED_WORKER_RESULT');
 need(s&&typeof s.truncated==='boolean'&&Number.isSafeInteger(s.matchedBehaviorClasses)&&s.matchedBehaviorClasses>=0&&Number.isSafeInteger(s.maxNodesReached)&&s.maxNodesReached>=1&&s.maxNodesReached<=11&&s.maxNodes===11&&s.maxCombinations===2000000&&s.maxStates===145000&&s.maxMs===7000,'AEC_INVALID_SEARCH_REPORT');
 if(s.truncated)return 'SYNTHESIS_TRUNCATED';
 if(r.status==='NO_MATCH_WITHIN_NODE_LIMIT'&&s.matchedBehaviorClasses===0&&r.candidate===null&&r.candidateSha256===null)return 'SYNTHESIS_NO_MATCH';
 need(r.status==='FROZEN_FOR_INDEPENDENT_TESTS'&&s.reason==='FIRST_MATCH_SIZE_FINISHED'&&s.matchedBehaviorClasses>=1&&r.candidate&&r.candidateSha256===hash(r.candidate),'AEC_INVALID_FROZEN_CANDIDATE');
 if(s.matchedBehaviorClasses!==1||s.ambiguity!=='NO_DIFFERENCE_OBSERVED_NOT_UNIQUENESS')return 'SYNTHESIS_AMBIGUOUS';
 return 'CANDIDATE';
}
function gradeFrozen(context,claimSha256){
 // The freeze is read from disk and validated before the independent oracle is opened.
 const {pack,evidenceSha256,fitFileSha256}=context;
 const fitBytes=read(context.fitPath,16000,true);
 need(sha(fitBytes)===fitFileSha256&&fitBytes.equals(context.fitBytes),'AEC_FIT_EVIDENCE_CHANGED');
 const bytes=read(context.freezePath,32768,true),freeze=decode(bytes),freezeSha256=sha(bytes);
 need(entries(freeze,['schema','claimSha256','evidenceSha256','fitFileSha256','result'])&&freeze.schema==='MANA_AEC_CANDIDATE_FREEZE_V1'&&freeze.claimSha256===claimSha256&&freeze.evidenceSha256===evidenceSha256&&freeze.fitFileSha256===fitFileSha256,'AEC_FREEZE_BINDING_MISMATCH');
 const r=freeze.result,kind=resultKind(r,context);
 const base={schema:'MANA_AEC_LEARNING_REVIEW_V1',evidenceSha256,fitFileSha256,freezeSha256,modelCalls:0,activationAuthorized:false,productionAllowed:false,unit:'twice-area-mm2',areaDenominator:2};
 const finish=v=>{const row={...base,...v};return {...row,gradeSha256:payloadDigest(row)};};
 if(kind!=='CANDIDATE')return finish({status:kind,candidateSha256:null,passed:0,total:TOTAL,testsRun:0});
 const {validateExpression,evaluateExpression}=require(pin(FILES.evaluator));
 validateExpression(r.candidate,FIELDS);
 let nodes=0;
 function powers(x,depth=0){
  need(++nodes<=11&&depth<=5,'AEC_CANDIDATE_OUTSIDE_BUDGET');
  if(Object.hasOwn(x,'field'))return [1];
  if(Object.hasOwn(x,'value')){need(Number.isInteger(x.value)&&x.value>=0&&x.value<=4,'AEC_CANDIDATE_LITERAL_REJECTED');return x.value===0?[0,1,2,3]:[0];}
  need(OPS.includes(x.op),'AEC_CANDIDATE_OPERATOR_REJECTED');
  const [l,q]=x.args.map(y=>powers(y,depth+1)),p=new Set();
  for(const a of l)for(const b of q)if(x.op==='multiply'){if(a+b<=3)p.add(a+b);}else if(a===b)p.add(a);
  return [...p];
 }
 need(powers(r.candidate).includes(2)&&nodes===r.search.maxNodesReached,'AEC_CANDIDATE_UNIT_OR_SIZE_MISMATCH');
 const {cases,twiceArea}=require(pin(FILES.oracle));
 need(cases.length===TOTAL,'AEC_HOLDOUT_SIZE_MISMATCH');
 const unorderedShape=([a,b,h])=>[Math.min(a,b),Math.max(a,b),h].join(',');
 const fitRows=new Set(pack.examples.map(([row])=>unorderedShape(row))),seen=new Set();
 for(const values of cases){
  const key=values.join(',');
  need(isVec(values)&&!fitRows.has(unorderedShape(values))&&!seen.has(key),'AEC_HOLDOUT_NOT_INDEPENDENT');
  seen.add(key);
 }
 const calculate=v=>{
  const x=evaluateExpression(r.candidate,Object.fromEntries(FIELDS.map((f,i)=>[f,v[i]])),FIELDS);
  need(Number.isSafeInteger(x)&&x>=0&&x<=LIMIT,'AEC_CANDIDATE_OUTPUT_REJECTED');return x;
 };
 need(pack.examples.every(([v,y])=>calculate(v)===y),'AEC_CANDIDATE_DID_NOT_FIT');
 const probe=[151,223,47],changed=FIELDS.every((_,i)=>{const v=[...probe];v[i]+=1;return calculate(v)!==calculate(probe);});
 if(!changed)return finish({status:'TEST_FAILED',candidateSha256:r.candidateSha256,passed:0,total:TOTAL,testsRun:0});
 let passed=0;
 for(const values of cases){
  const expected=twiceArea(values);
  try{if(BigInt(calculate(values))===expected)passed++;}catch{/* incorrect or out-of-domain output fails this test */}
 }
 return finish({status:passed===TOTAL?'AWAITING_HUMAN_REVIEW':'TEST_FAILED',candidateSha256:r.candidateSha256,passed,total:TOTAL,testsRun:TOTAL});
}
function readAecLearning(input){
 const c=prepare(input),stored=c.store.read();
 need(stored.state==='TERMINAL','AEC_LEARNING_NOT_TERMINAL_NO_RETRY');
 const grade=gradeFrozen(c,stored.claimSha256);
 need(equal(grade,stored.result),'AEC_GRADE_MISMATCH');
 return grade;
}
function learnAec(input){
 const c=prepare(input);
 const claim=c.store.claim();
 if(claim.state==='TERMINAL')return readAecLearning(input);
 need(claim.state==='CLAIMED','AEC_LEARNING_ALREADY_CLAIMED_NO_RETRY');
 put(c.workspace,'fit-only.json',c.fitBytes);
 const result=runWorker(c);
 resultKind(result,c);
 put(c.workspace,'frozen.json',Buffer.from(JSON.stringify({schema:'MANA_AEC_CANDIDATE_FREEZE_V1',claimSha256:claim.claimSha256,evidenceSha256:c.evidenceSha256,fitFileSha256:c.fitFileSha256,result})+'\n'));
 const grade=gradeFrozen(c,claim.claimSha256);
 claim.commit(grade);
 return grade;
}
module.exports={learnAec,readAecLearning};
