'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash,randomBytes}=require('node:crypto');
const {parseExactJSON}=require('../exact-json.cjs');
const {validateExpression,evaluateExpression}=require('../native/skill-expression.cjs');
const {payloadDigest}=require('../approval-store.cjs');
const {createWorkbench}=require('./mana-rd-loop.cjs');
const V='MANA_RD_PILOT_V1',F='MANA_RD_FEEDBACK_V1',OPS=['add','subtract','multiply','min','max'];
const sha=x=>createHash('sha256').update(x).digest('hex'),json=b=>parseExactJSON(new TextDecoder('utf-8',{fatal:true}).decode(b));
const id=x=>typeof x==='string'&&/^[a-z][a-z0-9_-]{0,59}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const same=(a,b)=>payloadDigest(a)===payloadDigest(b);
const fail=code=>{throw Error(code);};
const exact=(x,k)=>x&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).sort().join()===k.slice().sort().join();
function read(p,max=64000,isPrivate=false){
 if(typeof p!=='string'||!path.isAbsolute(p)||fs.realpathSync(p)!==p)fail('ABSOLUTE_REAL_FILE_REQUIRED');
 const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.size<1||s.size>max||isPrivate&&(s.nlink!==1||(s.mode&0o077)||(process.getuid&&s.uid!==process.getuid())))fail('INVALID_EVIDENCE_FILE');const b=Buffer.alloc(s.size);let off=0;while(off<b.length){const n=fs.readSync(fd,b,off,b.length-off);if(!n)fail('FILE_CHANGED');off+=n;}if(fs.fstatSync(fd).size!==s.size)fail('FILE_CHANGED');return b;}finally{fs.closeSync(fd);}
}
function privateDir(p){if(typeof p!=='string'||!path.isAbsolute(p)||path.resolve(p)!==p||fs.realpathSync(p)!==p)fail('PRIVATE_WORKSPACE_REQUIRED');const s=fs.lstatSync(p);if(!s.isDirectory()||(s.mode&0o077)||(process.getuid&&s.uid!==process.getuid()))fail('PRIVATE_WORKSPACE_REQUIRED');return [s.dev,s.ino];}
function exists(p){try{fs.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function sync(p){const fd=fs.openSync(p,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function save(dir,name,x){const fd=fs.openSync(path.join(dir,name),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(x)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}sync(dir);}
const validTags=t=>Array.isArray(t)&&t.length>=1&&t.length<=10&&new Set(t).size===t.length&&t.every(id);
function readCatalog({catalogPath,catalogSha256,masterPath}){
 if(!hash(catalogSha256))fail('REVIEWED_CATALOG_SHA_REQUIRED');
 const bytes=read(catalogPath);if(sha(bytes)!==catalogSha256)fail('CATALOG_SHA_MISMATCH');
 const c=json(bytes),master=read(masterPath,1048576);
 if(!exact(c,['schema','masterSha256','sources','missions'])||c.schema!==V||c.masterSha256!==sha(master)||!Array.isArray(c.missions)||c.missions.length<2||c.missions.length>12||!Array.isArray(c.sources)||c.sources.length<3||c.sources.length>24)fail('INVALID_APPROVED_CATALOG_OR_MASTER');
 const seen=new Set(),sourceSeen=new Set();
 for(const m of c.missions){
  if(!exact(m,['id','section','range','sectionSha256','tags','goal','fields','unit','tests','anchors','maxInput'])||!id(m.id)||seen.has(m.id)||typeof m.section!=='string'||!/^\d{1,2}\.\d{1,2}$/.test(m.section)||!Array.isArray(m.range)||m.range.length!==2||!m.range.every(Number.isSafeInteger)||m.range[0]<0||m.range[0]>=m.range[1]||m.range[1]>master.length||m.sectionSha256!==sha(master.subarray(...m.range))||!validTags(m.tags)||!validTags(m.fields)||m.fields.some(f=>!/^[a-z][a-z0-9_]{0,39}$/.test(f)||['constructor','prototype'].includes(f))||m.fields.length<2||m.fields.length>4||!['mm','mm2','mm3'].includes(m.unit)||typeof m.goal!=='string'||m.goal.length<20||m.goal.length>640||!Number.isSafeInteger(m.maxInput)||m.maxInput<1||m.maxInput>100000||!Array.isArray(m.anchors)||m.anchors.length!==m.fields.length||m.anchors.some(x=>!Number.isSafeInteger(x)||x<1||3*x+9>m.maxInput)||!Array.isArray(m.tests)||m.tests.length<6||m.tests.length>30)fail('INVALID_REVIEWED_TASK_MAPPING');
  for(const t of m.tests)if(!Array.isArray(t)||t.length!==2||!Array.isArray(t[0])||t[0].length!==m.fields.length||t[0].some(v=>!Number.isSafeInteger(v)||v<0||v>m.maxInput)||!Number.isSafeInteger(t[1])||t[1]<0||t[1]>1e12)fail('INVALID_INDEPENDENT_TEST_PACK');
  seen.add(m.id);
 }
 for(const s of c.sources){if(!exact(s,['id','section','tags','file','sha256'])||!id(s.id)||sourceSeen.has(s.id)||typeof s.section!=='string'||!validTags(s.tags)||s.file!==s.id+'.txt'||!hash(s.sha256))fail('INVALID_SOURCE_INDEX');sourceSeen.add(s.id);}
 return c;
}
function retrieve(c,m,catalogPath){
 const accepted=[],rejected=[];
 for(const s of c.sources){
  const tags=s.tags.filter(t=>m.tags.includes(t));
  if(s.section!==m.section||!tags.length){rejected.push({id:s.id,reason:s.section!==m.section?'different-section':'no-matching-term'});continue;}
  const bytes=read(path.join(path.dirname(catalogPath),s.file),2048);
  if(sha(bytes)!==s.sha256)fail('MATCHING_SOURCE_HASH_MISMATCH');
  // Catalog author explicitly approves these brief public/synthetic notes, not arbitrary search text.
  const note=new TextDecoder('utf-8',{fatal:true}).decode(bytes).trim();
  if(!/^Reviewed (?:source note|synthetic policy): [ -~]+$/.test(note)||note.length>400)fail('INVALID_VETTED_SOURCE_NOTE');
  accepted.push({id:s.id,section:s.section,sha256:s.sha256,matchedTerms:tags,note});
 }
 accepted.sort((a,b)=>b.matchedTerms.length-a.matchedTerms.length||a.id.localeCompare(b.id,'en'));
 if(accepted.length<2)fail('TWO_DISTINCT_VETTED_RECORDS_REQUIRED');
 return {selected:accepted.slice(0,4),rejected};
}
function grammar(fields){
 const q=JSON.stringify,ops=OPS.map(op=>q(q(op))).join(' | ');
 const leaf=[...fields.map(field=>q(JSON.stringify({field}))),q('{"value":')+' integer '+q('}')].join(' | ');
 const rules=['root ::= n4','integer ::= "0" | [1-9] [0-9]{0,3}','n0 ::= '+leaf];
 for(let i=1;i<=4;i++){const n='n'+(i-1);rules.push('n'+i+' ::= n0 | '+q('{"op":')+' ('+ops+') '+q(',"args":[')+' '+n+' '+q(',')+' '+n+' '+q(']}'));}
 return rules.join('\n');
}
function candidate(raw,m){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>4096)fail('INVALID_PROPOSAL');
 const x=parseExactJSON(raw);validateExpression(x,m.fields);
 function visit(v,d=0){if(d>4)fail('EXPRESSION_DEPTH');if(Object.hasOwn(v,'field'))return;if(Object.hasOwn(v,'value')){if(!Number.isInteger(v.value)||v.value<0||v.value>9999)fail('EXPRESSION_LITERAL');return;}if(!OPS.includes(v.op))fail('EXPRESSION_OPERATION');v.args.forEach(w=>visit(w,d+1));}
 visit(x);return x;
}
function runExact(x,m,values){const result=evaluateExpression(x,Object.fromEntries(m.fields.map((f,i)=>[f,values[i]])),m.fields);if(!Number.isSafeInteger(result)||result<0||result>1e12)fail('INVALID_INTEGER_RESULT');return result;}
function measure(x,m){
 const score={insensitive:[],passed:0,testsRun:0,total:m.tests.length,suiteSha256:payloadDigest({anchors:m.anchors,tests:m.tests})};
 for(let i=0;i<m.fields.length;i++)try{for(const mul of [1,2,3]){const a=m.anchors.map(t=>t*mul),b=[...a];b[i]+=3*mul;if(runExact(x,m,a)===runExact(x,m,b)){score.insensitive.push(m.fields[i]);break;}}}catch{score.insensitive.push(m.fields[i]);}
 if(!score.insensitive.length){for(const [v,want]of m.tests){score.testsRun++;try{if(runExact(x,m,v)===want)score.passed++;}catch{/* case failed */}}}
 return score;
}
const OLD_SHA='fba3b8b7658221eaf44a8b641c1e02fc646fa88d6c2e0e9fb31cfed927f6520e';
const STOP={activationAuthorized:false,productionAllowed:false,modelTrainingPerformed:false};
function createFeedback({priorWorkspace,catalogPath,catalogSha256,masterPath,mission,expectedPriorDigest,expectedMissing}={}){
 if(!id(mission)||!hash(expectedPriorDigest))fail('PINNED_HISTORICAL_REVIEW_REQUIRED');
 const originalIdentity=privateDir(priorWorkspace),workspace=priorWorkspace+'-feedback-v1';
 const root=path.dirname(workspace),source=()=>payloadDigest([__filename,require.resolve('../native/skill-expression.cjs'),require.resolve('../exact-json.cjs'),require.resolve('../approval-store.cjs'),require.resolve('./mana-rd-loop.cjs'),require.resolve('./mana-text-model.cjs'),require.resolve('./mana-rd-feedback-adviser.cjs')].map(p=>sha(read(p,128000))));
 const initial=source(),paths=['claim','review'].map(k=>path.join(priorWorkspace,mission+'-'+k+'.json'));
 const old=createWorkbench({workspace:priorWorkspace,catalogPath,catalogSha256,masterPath});
 const file=name=>path.join(workspace,name),load=name=>json(read(file(name),64000,true));
 function historical(){
  if(initial!==source()||sha(read(require.resolve('./mana-rd-loop.cjs'),128000))!==OLD_SHA||!same(privateDir(priorWorkspace),originalIdentity))fail('HISTORICAL_CONTEXT_CHANGED');
  const snapshot=()=>paths.map(p=>sha(read(p,64000,true))),before=snapshot();
  const proof=old.review(mission),e=proof.evidence,s=e.score,priorClaim=json(read(paths[0],64000,true));
  if(proof.digest!==expectedPriorDigest||e.status!=='BENCHMARK_FAILED'||e.activationAuthorized!==false||e.candidate===null||!s||s.testsRun!==0||s.passed!==0||!validTags(s.insensitive)||typeof priorClaim.providerId!=='string'||expectedMissing!==undefined&&!same(expectedMissing,s.insensitive)||!same(before,snapshot()))fail('PINNED_DEPENDENCE_FAILURE_MISMATCH');
  const catalog=readCatalog({catalogPath,catalogSha256,masterPath}),m=catalog.missions.find(k=>k.id===mission);
  if(!m||!same(measure(e.candidate,m),s))fail('HISTORICAL_BENCHMARK_MISMATCH');
  return {m,e,providerId:priorClaim.providerId,originalFilesSha256:before};
 }
 function bind(p){return {schema:F,priorDigest:expectedPriorDigest,originalFilesSha256:p.originalFilesSha256,priorWorkspace,originalIdentity,workspace,workspaceIdentity:privateDir(workspace),mission,source:initial,catalogSha256,taskSha256:payloadDigest(p.m)};}
 function scoreCandidate(x,p){
  if(same(x,p.e.candidate)||[1,2,3].every(k=>p.m.anchors.every((_,i)=>{
   const a=p.m.anchors.map(v=>v*k);a[i]+=k+1;
   try{return runExact(x,p.m,a)===runExact(p.e.candidate,p.m,a);}catch{return false;}
  })))return {status:'DUPLICATE_PROPOSAL',score:null};
  const score=measure(x,p.m);return {status:score.passed===score.total?'AWAITING_HUMAN_REVIEW':'BENCHMARK_FAILED',score};
 }
 function inspect(){
  const p=historical();
  if(!exists(workspace))return {status:'READY',mission,priorDigest:expectedPriorDigest,ineffectiveFields:p.e.score.insensitive,...STOP};
  try{
   const binding=bind(p),names=fs.readdirSync(workspace);
   if(names.length!==2||!names.includes('claim.json')||!names.includes('review.json'))fail('INCOMPLETE_ATTEMPT');
   const claim=load('claim.json'),r=load('review.json'),e=r.evidence;
   if(claim.providerId!==p.providerId||!hash(claim.transportSha256)||claim.budget!==1||!same(claim.binding,binding)||!same(e.binding,binding)||!same(e.ineffectiveFields,p.e.score.insensitive)||e.claimSha256!==payloadDigest(claim)||r.digest!==payloadDigest(e)||!same(e.safety,STOP))fail('CHANGED_FEEDBACK_RECEIPT');
   const computed=e.candidate===null?{status:e.status,score:null}:scoreCandidate(candidate(JSON.stringify(e.candidate),p.m),p);
   if(e.candidate===null&&!['INVALID_PROPOSAL','PROVIDER_UNAVAILABLE'].includes(e.status)||e.status!==computed.status||!same(e.score,computed.score))fail('CHANGED_FEEDBACK_RECEIPT');
   return {...r,status:e.status,reused:true,modelRequestsAttempted:0};
  }catch{return {status:'UNKNOWN_OUTCOME_NO_RETRY',mission,modelRequestsAttempted:0,...STOP};}
 }
 async function repair({propose,providerId,transportSha256}={}){
  if(typeof propose!=='function'||typeof providerId!=='string'||!providerId.trim()||providerId.length>160||!hash(transportSha256))fail('EXPLICIT_PINNED_LOCAL_PROPOSER_REQUIRED');
  const prior=historical();
  if(providerId!==prior.providerId)fail('RETRY_PROVIDER_DIFFERS_FROM_PRIOR');
  if(exists(workspace))return inspect();
  try{fs.mkdirSync(workspace,{mode:0o700});}catch(e){if(e.code==='EEXIST')return inspect();throw e;}
  sync(root);
  const binding=bind(prior),claim={binding,providerId,transportSha256,at:new Date().toISOString(),budget:1};
  save(workspace,'claim.json',claim);
  function unchanged(){if(!same(bind(historical()),binding)||!same(load('claim.json'),claim)||exists(file('review.json')))fail('EVIDENCE_CHANGED_NO_RETRY');}
  unchanged();
  let raw,x=null,status,score=null;
  try{raw=await propose({goal:prior.m.goal,fields:[...prior.m.fields],outputUnit:prior.m.unit,maxInput:prior.m.maxInput,notes:prior.e.binding.evidence.selected.map(s=>s.note),grammar:grammar(prior.m.fields),ineffectiveFields:[...prior.e.score.insensitive]});}catch{status='PROVIDER_UNAVAILABLE';}
  if(!status)try{x=candidate(raw,prior.m);({status,score}=scoreCandidate(x,prior));}catch{x=null;status='INVALID_PROPOSAL';}
  unchanged();const evidence={binding,status,candidate:x,score,ineffectiveFields:prior.e.score.insensitive,claimSha256:payloadDigest(claim),safety:STOP};
  const r={evidence,digest:payloadDigest(evidence)};save(workspace,'review.json',r);return {...r,status,modelRequestsAttempted:1};
 }
 return {inspect,repair};
}
module.exports={createFeedback};
