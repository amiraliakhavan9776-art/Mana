'use strict';
// One explicitly bounded local proposal per reviewed mission. No scheduler or deployment.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {readSpec:approvedReadSpec}=require('./spec-learning-catalog.cjs');
const {evolveSkill,proposeLocal,validateTask}=require('./skill-evolution.cjs');
const {evaluateExpression,validateExpression}=require('./skill-expression.cjs');
const {parseExactJSON}=require('../exact-json.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const digest=/^[a-f0-9]{64}$/,ident=/^[a-z][a-z0-9_-]{0,59}$/;
const safe={approved:false,productionDeploymentAllowed:false,modelTrainingPerformed:false};
function syncDir(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function privateDir(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir)||path.resolve(dir)!==dir)throw Error('Absolute normalized workspace required');
 let ancestor=dir;while(!exists(path.dirname(ancestor),path.basename(ancestor))){const parent=path.dirname(ancestor);if(parent===ancestor)break;ancestor=parent;}
 if(fs.realpathSync(ancestor)!==ancestor)throw Error('Workspace symlink ancestor refused');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});const st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(dir)!==dir||(st.mode&0o077)||(process.getuid&&st.uid!==process.getuid()))throw Error('Owned private non-symlink workspace required');
}
function writeOnce(dir,name,data){
 const bytes=JSON.stringify(data,null,2)+'\n';if(Buffer.byteLength(bytes)>250000)throw Error('Checkpoint too large');
 const fd=fs.openSync(path.join(dir,name),fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}syncDir(dir);
}
function read(dir,name){
 const fd=fs.openSync(path.join(dir,name),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const st=fs.fstatSync(fd);if(!st.isFile()||st.size>250000||st.nlink!==1||(st.mode&0o077))throw Error('Unsafe checkpoint');return parseExactJSON(fs.readFileSync(fd,'utf8'));}finally{fs.closeSync(fd);}
}
const exists=(dir,name)=>{try{fs.lstatSync(path.join(dir,name));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
function catalog(specPath,readSpec){
 const c=readSpec(specPath);
 if(!c||!digest.test(c.sha256)||!Array.isArray(c.missions)||c.missions.length<2||c.missions.length>50)throw Error('At least two reviewed missions required');
 const ids=new Set();
 for(const m of c.missions){
  if(!m||!ident.test(m.id)||ids.has(m.id)||typeof m.section!=='string'||!m.section||!digest.test(m.sectionSha256)||m.task?.id!==m.id)throw Error('Invalid reviewed mapping');
  validateTask(m.task);ids.add(m.id);
 }
 for(const m of c.missions)if(m.dependsOn!==undefined&&(!Array.isArray(m.dependsOn)||new Set(m.dependsOn).size!==m.dependsOn.length||m.dependsOn.some(id=>!ids.has(id)||id===m.id)))throw Error('Invalid dependency');
 // Cycles fail closed instead of looking like a completed course.
 const visiting=new Set(),done=new Set();function visit(id){if(visiting.has(id))throw Error('Cyclic reviewed dependencies');if(done.has(id))return;visiting.add(id);for(const dep of c.missions.find(m=>m.id===id).dependsOn||[])visit(dep);visiting.delete(id);done.add(id);}for(const id of ids)visit(id);
 return c;
}
const PRIOR_SOURCES={"spec-learning-loop.cjs":"b823a1b93a395fc3fbb6b760b37201a150ce9f4a8c24a0f7df7a755ce8ff3967","spec-learning-catalog.cjs":"fb4a02377c11d6870204e79f1b0a24bcb06b63b38275cb7b905681ff722dfd81","skill-evolution.cjs":"b96b463b4209faf789057432cd2fe55574539c07ddb9ea95e6d3eba78220c3a4","skill-expression.cjs":"1241583c48b400833938799ea5538a7585cd8862444c930fea0b580741829261","exact-json.cjs":"6991fc39b917fea5441df51fa1d7c7fea9449de9ecc3839dd827127b4f7bca2b","skill-grammar.cjs":"714f36476bdefb30b7e55ebc06f9e8220fe5de6c4969ba9a253dadc92181336a"};
const PRIOR_ENGINE='20346827e41334ee91eb78c96d4a1cbf6e2a5c12de658ce90f91f6ea2149c624';
const PRIOR_MISSIONS='a910ff13088960705393144537987c4496da4bb0c9dffd46d37254db2ed31f35';
const FEEDBACK='A previous bounded proposal failed independent verification. Check output dimensions and ensure every required input has an effective role. Return only one bounded expression. No hidden examples or expected answers are provided.';
const FEEDBACK_POLICY='spec-dimension-feedback-v1';
function existingPrivate(dir){if(typeof dir!=='string'||!path.isAbsolute(dir)||path.resolve(dir)!==dir)throw Error('Absolute feedback workspace required');const st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(dir)!==dir||(st.mode&0o077)||(process.getuid&&st.uid!==process.getuid()))throw Error('Unsafe feedback workspace');}
function feedbackEvidence(dir,c,workspace,port,model){
 existingPrivate(dir);if(typeof workspace!=='string'||!path.isAbsolute(workspace))throw Error('Absolute new workspace required');const target=path.resolve(workspace);if(target===dir||target.startsWith(dir+path.sep)||dir.startsWith(target+path.sep))throw Error('Feedback requires a separate new workspace');
 if(exists(dir,'run.lock'))throw Error('Prior trial is running or unknown');
 const manifest=read(dir,'manifest.json'),b=manifest.binding;
 const legacy=c.missions.map(({dimensionContract,...m})=>m);
 if(manifest.schema!=='MANA_SPEC_LEARNING_MANIFEST_V1'||!b||manifest.bindingHash!==hash(JSON.stringify(b))||b.schema!=='MANA_SPEC_LEARNING_BINDING_V1'||b.providerConstraint!=='llama-gbnf-v1'||b.specSha256!==c.sha256||b.missionsSha256!==PRIOR_MISSIONS||hash(JSON.stringify(legacy))!==PRIOR_MISSIONS||b.loopbackPort!==port||b.modelIdentifier!==model||!b.sources||Object.keys(b.sources).length!==Object.keys(PRIOR_SOURCES).length||Object.entries(PRIOR_SOURCES).some(([k,v])=>b.sources[k]!==v))throw Error('Unreviewed prior feedback manifest');
 const targetMission=c.missions.find(m=>!(m.dependsOn||[]).length);if(!targetMission)throw Error('No initial feedback mission');
 if(c.missions.some(m=>m.id!==targetMission.id&&(exists(dir,m.id+'.claim.json')||exists(dir,m.id+'.receipt.json'))))throw Error('Prior failed trial contains unexpected downstream state');
 const m=targetMission,claim=read(dir,m.id+'.claim.json'),receipt=read(dir,m.id+'.receipt.json');
 if(claim.schema!=='MANA_SPEC_LEARNING_CLAIM_V1'||claim.bindingHash!==manifest.bindingHash||claim.missionId!==m.id||claim.sectionSha256!==m.sectionSha256||claim.proposalBudget!==1||!Number.isFinite(Date.parse(claim.startedAt))||receipt.schema!=='MANA_SPEC_LEARNING_RECEIPT_V1'||receipt.providerConstraint!=='llama-gbnf-v1'||receipt.bindingHash!==manifest.bindingHash||receipt.claimHash!==hash(JSON.stringify(claim))||receipt.missionId!==m.id||receipt.independentPass!==false||receipt.resultHash!==hash(JSON.stringify(receipt.result)))throw Error('Prior feedback chain mismatch');
 const result=receipt.result,taskHash=hash(JSON.stringify({task:m.task,engineHash:PRIOR_ENGINE}));
 if(result.status!=='BUDGET_EXHAUSTED'||result.taskHash!==taskHash||result.attempts!==1||result.lastOutcome?.stage!=='benchmark'||result.lastOutcome?.code!=='BENCHMARK_FAILED')throw Error('Prior trial is not a verified failed benchmark');
 const engine=path.join(dir,'engine'),attemptDir=path.join(engine,m.id+'-'+taskHash.slice(0,16));existingPrivate(engine);existingPrivate(attemptDir);
 if(exists(attemptDir,'lock'))throw Error('Prior engine attempt interrupted');
 const attempt=read(attemptDir,'attempt-1.json');
 if(attempt.schema!=='MANA_SKILL_CANDIDATE_V1'||attempt.taskId!==m.id||attempt.taskHash!==taskHash||attempt.engineHash!==PRIOR_ENGINE||attempt.attempt!==1||attempt.status!=='CANDIDATE_REJECTED'||attempt.outcome?.stage!=='benchmark'||attempt.outcome?.code!=='BENCHMARK_FAILED'||attempt.candidateHash!==hash(JSON.stringify(attempt.expression)))throw Error('Prior candidate evidence mismatch');
 validateExpression(attempt.expression,m.task.fields);const results=m.task.tests.map((t,index)=>{let pass=false;try{pass=evaluateExpression(attempt.expression,t.input,m.task.fields)===t.expected;}catch{}return {index,pass};});
 if(results.every(x=>x.pass)||attempt.total!==results.length||attempt.passed!==results.filter(x=>x.pass).length||JSON.stringify(attempt.results)!==JSON.stringify(results))throw Error('Prior failure not independently reproduced');
 const checker=require('./skill-dimension-check.cjs');if(!checker.validateDimensionContract(m.task.fields,m.dimensionContract))throw Error('Invalid reviewed dimension contract');const screen=checker.checkSkillDimensions(attempt.expression,m.task.fields,m.dimensionContract);
 const diagnostic=screen.code==='OUTPUT_DIMENSION_MISMATCH'&&Number.isInteger(screen.actualPower)?'Previous proposal output had length dimension L^'+screen.actualPower+'; the requested output requires L^'+m.dimensionContract.expectedPower+'. Reconsider how every required input affects the output. Return only one bounded expression.':FEEDBACK;
 return {missionId:m.id,evidenceSha256:hash(JSON.stringify({manifest,claim,receipt,attempt})),diagnosticSha256:hash(diagnostic),diagnostic,policy:FEEDBACK_POLICY};
}
const DIMENSION_PRIOR_SOURCES={"spec-learning-loop.cjs":"b6f31f88a202bacb63a28d8d7987d163d90514fbe1bdba2f3337534b2c8e4895","spec-learning-catalog.cjs":"1b96f0385c1a70b1ac78fdebb108d436e9ecceb8da8fcac6d4eceb19ee103a3c","skill-evolution.cjs":"ca64c91acef8204f9af144a5c1376ceebeba61a82eb655ed644bee24ec1cee66","skill-expression.cjs":"1241583c48b400833938799ea5538a7585cd8862444c930fea0b580741829261","exact-json.cjs":"6991fc39b917fea5441df51fa1d7c7fea9449de9ecc3839dd827127b4f7bca2b","skill-grammar.cjs":"714f36476bdefb30b7e55ebc06f9e8220fe5de6c4969ba9a253dadc92181336a","skill-dimension-check.cjs":"0d8e245b840d4a46f15c9d6d439b860153441c6abe4b30ef6d616a9266ef8dcc"};
function dimensionEvidence(dir,c,workspace,port,model,original){
 existingPrivate(dir);const target=path.resolve(workspace);if(target===dir||target.startsWith(dir+path.sep)||dir.startsWith(target+path.sep))throw Error('Dimension feedback requires separate new workspace');if(exists(dir,'run.lock'))throw Error('Dimension feedback trial interrupted');
 const manifest=read(dir,'manifest.json'),b=manifest.binding;
 if(manifest.schema!=='MANA_SPEC_LEARNING_MANIFEST_V1'||!b||manifest.bindingHash!==hash(JSON.stringify(b))||b.schema!=='MANA_SPEC_LEARNING_BINDING_V1'||b.providerConstraint!=='llama-gbnf-v1'||b.specSha256!==c.sha256||b.missionsSha256!=='57f70c53c8c87941e834ef075c210a3ae9b4b3e77202c94025cf6efd8ba67909'||b.missionsSha256!==hash(JSON.stringify(c.missions))||b.loopbackPort!==port||b.modelIdentifier!==model||JSON.stringify(b.feedback)!==JSON.stringify(original)||!b.sources||Object.keys(b.sources).length!==Object.keys(DIMENSION_PRIOR_SOURCES).length||Object.entries(DIMENSION_PRIOR_SOURCES).some(([k,v])=>b.sources[k]!==v))throw Error('Unreviewed prior dimension feedback manifest');
 const m=c.missions.find(m=>m.id===original.missionId);if(!m)throw Error('Unknown dimension feedback mission');
 if(c.missions.some(other=>other.id!==m.id&&(exists(dir,other.id+'.claim.json')||exists(dir,other.id+'.receipt.json'))))throw Error('Unexpected downstream dimension feedback state');
 const claim=read(dir,m.id+'.claim.json'),receipt=read(dir,m.id+'.receipt.json');
 if(claim.schema!=='MANA_SPEC_LEARNING_CLAIM_V1'||claim.bindingHash!==manifest.bindingHash||claim.missionId!==m.id||claim.sectionSha256!==m.sectionSha256||claim.proposalBudget!==1||!Number.isFinite(Date.parse(claim.startedAt))||receipt.schema!=='MANA_SPEC_LEARNING_RECEIPT_V1'||receipt.providerConstraint!=='llama-gbnf-v1'||receipt.bindingHash!==manifest.bindingHash||receipt.claimHash!==hash(JSON.stringify(claim))||receipt.missionId!==m.id||receipt.independentPass!==false||receipt.resultHash!==hash(JSON.stringify(receipt.result))||JSON.stringify(receipt.feedback)!==JSON.stringify(original))throw Error('Dimension feedback chain mismatch');
 const engineHash='122885affce1b960dc4512e0da99c2d89f12cdd268ad47da6e3af018a44a44b1',taskHash=hash(JSON.stringify({task:m.task,engineHash,candidatePolicyId:FEEDBACK_POLICY})),result=receipt.result;
 if(result.status!=='BUDGET_EXHAUSTED'||result.taskHash!==taskHash||result.attempts!==1||result.lastOutcome?.stage!=='dimension'||result.testsRun!==0||result.passed!==0||result.total!==m.task.tests.length)throw Error('Prior dimension trial is not a screened rejection');
 const engine=path.join(dir,'engine'),attemptDir=path.join(engine,m.id+'-'+taskHash.slice(0,16));existingPrivate(engine);existingPrivate(attemptDir);if(exists(attemptDir,'lock'))throw Error('Prior dimension engine interrupted');const attempt=read(attemptDir,'attempt-1.json');
 if(attempt.schema!=='MANA_SKILL_CANDIDATE_V1'||attempt.taskId!==m.id||attempt.taskHash!==taskHash||attempt.engineHash!==engineHash||attempt.attempt!==1||attempt.status!=='CANDIDATE_REJECTED'||attempt.candidateHash!==hash(JSON.stringify(attempt.expression))||attempt.outcome?.stage!=='dimension'||attempt.passed!==0||attempt.total!==m.task.tests.length||!Array.isArray(attempt.results)||attempt.results.length!==0)throw Error('Dimension attempt mismatch');
 validateExpression(attempt.expression,m.task.fields);const checked={...require('./skill-dimension-check.cjs').checkSkillDimensions(attempt.expression,m.task.fields,m.dimensionContract),expectedPower:m.dimensionContract.expectedPower},screen={ok:checked.ok,code:checked.code};for(const key of ['actualPower','expectedPower'])if(Number.isInteger(checked[key])&&Math.abs(checked[key])<=128)screen[key]=checked[key];if(Array.isArray(checked.missingFields))screen.missingFields=[...checked.missingFields];
 if(screen.ok!==false||JSON.stringify(screen)!==JSON.stringify(attempt.screen)||JSON.stringify(screen)!==JSON.stringify(result.lastScreen)||attempt.outcome.code!==screen.code||result.lastOutcome.code!==screen.code)throw Error('Prior dimension rejection not independently reproduced');
 return hash(JSON.stringify({manifest,claim,receipt,attempt}));
}
function reviewedFeedback(originalDir,dimensionDir,c,workspace,port,model){const original=feedbackEvidence(originalDir,c,workspace,port,model);return dimensionDir===undefined?original:{...original,dimensionEvidenceSha256:dimensionEvidence(dimensionDir,c,workspace,port,model,original)};}
function identity(c,port,model,constraint,feedback){
 const files=[__filename,require.resolve('./spec-learning-catalog.cjs'),require.resolve('./skill-evolution.cjs'),require.resolve('./skill-expression.cjs'),require.resolve('../exact-json.cjs')];
 if(feedback)files.push(require.resolve('./skill-dimension-check.cjs'));
 if(['llama-gbnf-v1','llama-dimension-gbnf-v1'].includes(constraint))files.push(require.resolve('./skill-grammar.cjs'));
 const sources={};for(const file of files)sources[path.basename(file)]=hash(fs.readFileSync(file));
 return {schema:'MANA_SPEC_LEARNING_BINDING_V1',specSha256:c.sha256,missionsSha256:hash(JSON.stringify(c.missions)),sources,modelIdentifier:model,providerConstraint:constraint||'none',...(feedback?{feedback}:{}),loopbackPort:port,nodeVersion:process.version};
}
function independentlyPassed(result,task){
 if(!result||result.status!=='BENCHMARK_PASSED_AWAITING_REVIEW')return false;
 validateExpression(result.expression,task.fields);
 if(result.candidateHash!==hash(JSON.stringify(result.expression))||result.total!==task.tests.length||result.passed!==task.tests.length)throw Error('Passing receipt evidence mismatch');
 if(!task.tests.every(t=>evaluateExpression(result.expression,t.input,task.fields)===t.expected))throw Error('Independent benchmark failed on resume');
 return true;
}
async function runWithCatalog(readSpec,{specPath,workspace,port,model,propose,constraint,reviewFeedback=false,feedbackFrom,dimensionFeedbackFrom}={}){
 if(constraint!==undefined&&!['llama-gbnf-v1','llama-dimension-gbnf-v1'].includes(constraint))throw Error('Unsupported provider constraint policy');
 if(typeof reviewFeedback!=='boolean'||reviewFeedback&&(!['llama-gbnf-v1','llama-dimension-gbnf-v1'].includes(constraint)||typeof feedbackFrom!=='string')||!reviewFeedback&&feedbackFrom!==undefined)throw Error('Explicit review-feedback and source require GBNF mode');
 if(constraint==='llama-dimension-gbnf-v1'&&!reviewFeedback)throw Error('Dimension grammar requires explicit reviewed feedback');
 if(dimensionFeedbackFrom!==undefined&&(constraint!=='llama-dimension-gbnf-v1'||typeof dimensionFeedbackFrom!=='string'))throw Error('Dimension feedback source requires explicit dimension grammar mode');
 const providerConstraint=constraint||'none';
 if(typeof specPath!=='string'||!path.isAbsolute(specPath)||!Number.isInteger(port)||port<1||port>65535||typeof model!=='string'||!model.trim()||model.length>300||propose!==undefined&&typeof propose!=='function')throw Error('Explicit absolute spec path and local model settings required');
 const c=catalog(specPath,readSpec),feedback=reviewFeedback?reviewedFeedback(feedbackFrom,dimensionFeedbackFrom,c,workspace,port,model):null,binding=identity(c,port,model,constraint,feedback),bindingHash=hash(JSON.stringify(binding));
 privateDir(workspace);const lock=path.join(workspace,'run.lock');
 // A stale lock means an interrupted operation and requires manual investigation.
 const lockFd=fs.openSync(lock,'wx',0o600);try{fs.writeFileSync(lockFd,JSON.stringify({pid:process.pid,bindingHash}));fs.fsyncSync(lockFd);}finally{fs.closeSync(lockFd);}syncDir(workspace);
 try{
  const manifest={schema:'MANA_SPEC_LEARNING_MANIFEST_V1',binding,bindingHash};
  if(exists(workspace,'manifest.json')){if(JSON.stringify(read(workspace,'manifest.json'))!==JSON.stringify(manifest))throw Error('Stale or corrupt manifest; use reviewed separate workspace');}
  else{if(fs.readdirSync(workspace).some(x=>x!=='run.lock'))throw Error('Nonempty workspace without manifest');writeOnce(workspace,'manifest.json',manifest);}
  const states=new Map(),unknown=[];
  const allowed=new Set(['manifest.json','run.lock','engine']);for(const m of c.missions){allowed.add(m.id+'.claim.json');allowed.add(m.id+'.receipt.json');}
  for(const name of fs.readdirSync(workspace))if(!allowed.has(name))throw Error('Unexpected workspace state');
  for(const m of c.missions){
   const cn=m.id+'.claim.json',rn=m.id+'.receipt.json',hasClaim=exists(workspace,cn),hasReceipt=exists(workspace,rn);
   if(hasReceipt&&!hasClaim)throw Error('Receipt without claim');if(!hasClaim)continue;
   const claim=read(workspace,cn);
   if(claim.schema!=='MANA_SPEC_LEARNING_CLAIM_V1'||claim.bindingHash!==bindingHash||claim.missionId!==m.id||claim.sectionSha256!==m.sectionSha256||typeof claim.startedAt!=='string'||!Number.isFinite(Date.parse(claim.startedAt))||claim.proposalBudget!==1)throw Error('Claim mismatch');
   if(!hasReceipt){unknown.push(m.id);continue;}
   const receipt=read(workspace,rn);
   if(feedback&&JSON.stringify(receipt.feedback)!==JSON.stringify(feedback))throw Error('Feedback evidence binding mismatch');
   if(receipt.providerConstraint!==providerConstraint||receipt.schema!=='MANA_SPEC_LEARNING_RECEIPT_V1'||receipt.bindingHash!==bindingHash||receipt.missionId!==m.id||receipt.claimHash!==hash(JSON.stringify(claim))||receipt.resultHash!==hash(JSON.stringify(receipt.result)))throw Error('Receipt mismatch');
   const passed=independentlyPassed(receipt.result,m.task);
   if(passed&&feedback&&!require('./skill-dimension-check.cjs').checkSkillDimensions(receipt.result.expression,m.task.fields,m.dimensionContract).ok)throw Error('Stored dimension/dependence evidence invalid');
   if(receipt.independentPass!==passed)throw Error('Receipt status mismatch');states.set(m.id,{passed,result:receipt.result});
  }
  if(unknown.length)return {status:'INTERRUPTED_UNKNOWN',providerConstraint,missionIds:unknown,reason:'Durable claim has no final receipt; no automatic repeat.',...safe};
  for(const m of c.missions)if(states.has(m.id)&&(m.dependsOn||[]).some(id=>!states.get(id)?.passed))throw Error('Recorded mission prerequisite not independently passed');
  if(feedback&&states.has(feedback.missionId))return {status:'FEEDBACK_TRIAL_COMPLETE',providerConstraint,feedback,missionId:feedback.missionId,result:states.get(feedback.missionId).result,reason:'Single manually authorized feedback trial spent; no downstream proposal.',...safe};
  const mission=c.missions.find(m=>!states.has(m.id)&&(m.dependsOn||[]).every(id=>states.get(id)?.passed));
  if(!mission)return {providerConstraint,status:c.missions.every(m=>states.get(m.id)?.passed)?'REVIEWED_COURSE_PASSED':'NO_READY_MISSION',completed:[...states].filter(([,v])=>v.passed).map(([id])=>id),reason:'No unclaimed mission with independently passing prerequisites; no model call.',...safe};
  if(feedback&&mission.id!==feedback.missionId)throw Error('Feedback target does not match selected mission');
  const candidateCheck=feedback?expression=>({...require('./skill-dimension-check.cjs').checkSkillDimensions(expression,mission.task.fields,mission.dimensionContract),expectedPower:mission.dimensionContract.expectedPower}):undefined;
  const selectedBecause='First unclaimed reviewed mapping in pinned catalog order; all prerequisites independently revalidated.';
  const claim={schema:'MANA_SPEC_LEARNING_CLAIM_V1',bindingHash,missionId:mission.id,sectionSha256:mission.sectionSha256,startedAt:new Date().toISOString(),proposalBudget:1};
  writeOnce(workspace,mission.id+'.claim.json',claim); // fsync file AND directory before any model dispatch
  const engine=path.join(workspace,'engine');privateDir(engine);
  let called=false;
  const proposal=async args=>{if(called)throw Error('One proposal budget exceeded');called=true;return (propose||proposeLocal)({...args,port,model,...(constraint?{constraint}:{}),...(constraint==='llama-dimension-gbnf-v1'?{dimensionGrammarOptions:{expectedPower:mission.dimensionContract.expectedPower}}:{})});};
  // Any thrown execution leaves the durable claim without receipt: unknown, never blindly retried.
  const result=await evolveSkill({task:mission.task,workspace:engine,propose:proposal,maxAttempts:1,...(feedback?{candidateCheck,candidatePolicyId:FEEDBACK_POLICY,initialFeedback:feedback.diagnostic}:{})});
  if(feedback&&JSON.stringify(reviewedFeedback(feedbackFrom,dimensionFeedbackFrom,catalog(specPath,readSpec),workspace,port,model))!==JSON.stringify(feedback))throw Error('Prior feedback evidence changed during execution');
  if(!called)throw Error('Unexpected preexisting engine checkpoint; no new proposal dispatched');
  if(hash(JSON.stringify(identity(catalog(specPath,readSpec),port,model,constraint,feedback)))!==bindingHash)throw Error('Source changed during execution; result requires reconciliation');
  const independentPass=independentlyPassed(result,mission.task);
  if(independentPass&&candidateCheck&&!candidateCheck(result.expression).ok)throw Error('Dimension or dependence check failed despite passing result');
  const receipt={schema:'MANA_SPEC_LEARNING_RECEIPT_V1',providerConstraint,...(feedback?{feedback}:{}),bindingHash,missionId:mission.id,claimHash:hash(JSON.stringify(claim)),result,resultHash:hash(JSON.stringify(result)),independentPass};
  writeOnce(workspace,mission.id+'.receipt.json',receipt);
  return {providerConstraint,...(feedback?{feedback}:{}),status:independentPass?'SPEC_LEARNING_PASSED':'SPEC_LEARNING_REVIEW_REQUIRED',missionId:mission.id,section:mission.section,sectionSha256:mission.sectionSha256,specSha256:c.sha256,selectedBecause,result,proposalDispatched:called,...safe};
 }finally{fs.unlinkSync(lock);syncDir(workspace);}
}
function createSpecLearning({readSpec=approvedReadSpec}={}){if(typeof readSpec!=='function')throw Error('Trusted catalog reader required');return options=>runWithCatalog(readSpec,options);}
const runSpecLearning=createSpecLearning();
module.exports={runSpecLearning,createSpecLearning};
