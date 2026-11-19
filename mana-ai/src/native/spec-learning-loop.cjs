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
 if(!path.isAbsolute(dir)||path.resolve(dir)!==dir)throw Error('Absolute normalized workspace required');
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
function identity(c,port,model,constraint){
 const files=[__filename,require.resolve('./spec-learning-catalog.cjs'),require.resolve('./skill-evolution.cjs'),require.resolve('./skill-expression.cjs'),require.resolve('../exact-json.cjs')];
 if(constraint==='llama-gbnf-v1')files.push(require.resolve('./skill-grammar.cjs'));
 const sources={};for(const file of files)sources[path.basename(file)]=hash(fs.readFileSync(file));
 return {schema:'MANA_SPEC_LEARNING_BINDING_V1',specSha256:c.sha256,missionsSha256:hash(JSON.stringify(c.missions)),sources,modelIdentifier:model,providerConstraint:constraint||'none',loopbackPort:port,nodeVersion:process.version};
}
function independentlyPassed(result,task){
 if(!result||result.status!=='BENCHMARK_PASSED_AWAITING_REVIEW')return false;
 validateExpression(result.expression,task.fields);
 if(result.candidateHash!==hash(JSON.stringify(result.expression))||result.total!==task.tests.length||result.passed!==task.tests.length)throw Error('Passing receipt evidence mismatch');
 if(!task.tests.every(t=>evaluateExpression(result.expression,t.input,task.fields)===t.expected))throw Error('Independent benchmark failed on resume');
 return true;
}
async function runWithCatalog(readSpec,{specPath,workspace,port,model,propose,constraint}={}){
 if(constraint!==undefined&&constraint!=='llama-gbnf-v1')throw Error('Unsupported provider constraint policy');
 const providerConstraint=constraint||'none';
 if(typeof specPath!=='string'||!path.isAbsolute(specPath)||!Number.isInteger(port)||port<1||port>65535||typeof model!=='string'||!model.trim()||model.length>300||propose!==undefined&&typeof propose!=='function')throw Error('Explicit absolute spec path and local model settings required');
 const c=catalog(specPath,readSpec),binding=identity(c,port,model,constraint),bindingHash=hash(JSON.stringify(binding));
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
   if(receipt.providerConstraint!==providerConstraint||receipt.schema!=='MANA_SPEC_LEARNING_RECEIPT_V1'||receipt.bindingHash!==bindingHash||receipt.missionId!==m.id||receipt.claimHash!==hash(JSON.stringify(claim))||receipt.resultHash!==hash(JSON.stringify(receipt.result)))throw Error('Receipt mismatch');
   const passed=independentlyPassed(receipt.result,m.task);
   if(receipt.independentPass!==passed)throw Error('Receipt status mismatch');states.set(m.id,{passed,result:receipt.result});
  }
  if(unknown.length)return {status:'INTERRUPTED_UNKNOWN',providerConstraint,missionIds:unknown,reason:'Durable claim has no final receipt; no automatic repeat.',...safe};
  for(const m of c.missions)if(states.has(m.id)&&(m.dependsOn||[]).some(id=>!states.get(id)?.passed))throw Error('Recorded mission prerequisite not independently passed');
  const mission=c.missions.find(m=>!states.has(m.id)&&(m.dependsOn||[]).every(id=>states.get(id)?.passed));
  if(!mission)return {providerConstraint,status:c.missions.every(m=>states.get(m.id)?.passed)?'REVIEWED_COURSE_PASSED':'NO_READY_MISSION',completed:[...states].filter(([,v])=>v.passed).map(([id])=>id),reason:'No unclaimed mission with independently passing prerequisites; no model call.',...safe};
  const selectedBecause='First unclaimed reviewed mapping in pinned catalog order; all prerequisites independently revalidated.';
  const claim={schema:'MANA_SPEC_LEARNING_CLAIM_V1',bindingHash,missionId:mission.id,sectionSha256:mission.sectionSha256,startedAt:new Date().toISOString(),proposalBudget:1};
  writeOnce(workspace,mission.id+'.claim.json',claim); // fsync file AND directory before any model dispatch
  const engine=path.join(workspace,'engine');privateDir(engine);
  let called=false;
  const proposal=async args=>{if(called)throw Error('One proposal budget exceeded');called=true;return (propose||proposeLocal)({...args,port,model,...(constraint?{constraint}:{})});};
  // Any thrown execution leaves the durable claim without receipt: unknown, never blindly retried.
  const result=await evolveSkill({task:mission.task,workspace:engine,propose:proposal,maxAttempts:1});
  if(!called)throw Error('Unexpected preexisting engine checkpoint; no new proposal dispatched');
  if(hash(JSON.stringify(identity(catalog(specPath,readSpec),port,model,constraint)))!==bindingHash)throw Error('Source changed during execution; result requires reconciliation');
  const independentPass=independentlyPassed(result,mission.task);
  const receipt={schema:'MANA_SPEC_LEARNING_RECEIPT_V1',providerConstraint,bindingHash,missionId:mission.id,claimHash:hash(JSON.stringify(claim)),result,resultHash:hash(JSON.stringify(result)),independentPass};
  writeOnce(workspace,mission.id+'.receipt.json',receipt);
  return {providerConstraint,status:independentPass?'SPEC_LEARNING_PASSED':'SPEC_LEARNING_REVIEW_REQUIRED',missionId:mission.id,section:mission.section,sectionSha256:mission.sectionSha256,specSha256:c.sha256,selectedBecause,result,proposalDispatched:called,...safe};
 }finally{fs.unlinkSync(lock);syncDir(workspace);}
}
function createSpecLearning({readSpec=approvedReadSpec}={}){if(typeof readSpec!=='function')throw Error('Trusted catalog reader required');return options=>runWithCatalog(readSpec,options);}
const runSpecLearning=createSpecLearning();
module.exports={runSpecLearning,createSpecLearning};
