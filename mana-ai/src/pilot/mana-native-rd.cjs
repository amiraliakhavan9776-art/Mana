'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {parseExactJSON}=require('../exact-json.cjs'),{payloadDigest}=require('../approval-store.cjs');
const app=path.resolve(__dirname,'../..'),packDir=path.join(app,'native-rd-pilot');
const CATALOG='d0a4041fb609a781f34e701f7ac6517bdfb1a34a2cbf382899c62d977eef922c';
const EVALUATOR='1241583c48b400833938799ea5538a7585cd8862444c930fea0b580741829261';
const WORKER='30fc3b1b5121ee61d6a86ef1ae83e223d2f5b58f547fb4dad4a4804016e1ddf6';
const LAUNCH='4e5ff093f24663056604fa04be773944bc3c0e78dba3e64ae7e4ef5a5d74852a';
const PACKS={
 'net-finish-length-mm':{name:'floor',fit:'ab5564060f2af5e39d13c23e3e33adb20ba189916b76aeee82e57507aa99383e',fresh:'8903e33c17aa7da643fe1f700a3e50e1aa05f56b782882dcfcac525a6a2e3f79'},
 'uniform-layer-volume-mm3':{name:'volume',fit:'e337b44768dfc25d790ec8cabfe767d57801eacda49ce97e07bb0a13662edc0e',fresh:'4c7b52e3c3533ee6196a53571d7864a0ddbc9138174a5885ec1e96b64149b6ea'}
};
const REASON_FA='اولین مأموریت بازبینی‌شدهٔ سند که هنوز در این صف یادگیری بومی رسید ندارد.';
const RESUME_FA='پیشنهاد قبلاً ثبت شده است؛ فقط بررسی نتیجه ادامه پیدا می‌کند.';
const S='MANA_NATIVE_RD_REVIEW_V1',SAFE={modelCalls:0,activationAuthorized:false,productionAllowed:false,modelTrainingPerformed:false};
const sha=x=>createHash('sha256').update(x).digest('hex'),same=(a,b)=>payloadDigest(a)===payloadDigest(b),fail=x=>{throw Error(x);};
const decode=b=>parseExactJSON(new TextDecoder('utf-8',{fatal:true}).decode(b));
function read(p,limit=32000,priv=false){
 if(typeof p!=='string'||!path.isAbsolute(p)||fs.realpathSync(p)!==p)fail('EXACT_REAL_FILE_REQUIRED');
 const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{const st=fs.fstatSync(fd);if(!st.isFile()||st.size<1||st.size>limit||priv&&(st.nlink!==1||(st.mode&0o077)||(process.getuid&&st.uid!==process.getuid())))fail('INVALID_EVIDENCE_FILE');const b=Buffer.alloc(st.size);for(let i=0;i<b.length;){const n=fs.readSync(fd,b,i,b.length-i);if(!n)fail('FILE_CHANGED');i+=n;}if(fs.fstatSync(fd).size!==st.size)fail('FILE_CHANGED');return b;}finally{fs.closeSync(fd);}
}
function pin(f,hash,limit){const b=read(f,limit);if(sha(b)!==hash)fail('PIN_CHANGED');return b;}
function exists(p){try{fs.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function privateDir(p){if(typeof p!=='string'||!path.isAbsolute(p)||path.resolve(p)!==p||fs.realpathSync(p)!==p)fail('PRIVATE_WORKSPACE_REQUIRED');const s=fs.lstatSync(p);if(!s.isDirectory()||(s.mode&0o077)||(process.getuid&&s.uid!==process.getuid()))fail('PRIVATE_WORKSPACE_REQUIRED');return [s.dev,s.ino];}
function sync(p){const d=fs.openSync(p,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
function save(dir,name,v){const fd=fs.openSync(path.join(dir,name),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(v)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}sync(dir);}
const worker=path.join(packDir,'native-synth.cjs'),launch=path.join(packDir,'permission-launch.cjs');
const fit=p=>path.join(packDir,'fit-only',p.name+'.json'),fresh=p=>path.join(packDir,'verify-only',p.name+'.json');
const pathFor=(m,name)=>m.id+'-'+name+'.json';
function catalog(masterPath){
 const dir=path.join(app,'rd-pilot'),c=decode(pin(path.join(dir,'catalog.json'),CATALOG));
 const master=read(masterPath,1048576);
 if(sha(master)!==c.masterSha256||!same(c.missions.map(m=>m.id),Object.keys(PACKS)))fail('MASTER_OR_CATALOG_CHANGED');
 for(const m of c.missions)if(sha(master.subarray(...m.range))!==m.sectionSha256)fail('MASTER_SECTION_CHANGED');
 // Mirrors the frozen PR14 catalog selector without importing or mutating its state.
 for(const m of c.missions){
  m.research={selected:[],rejected:[]};
  for(const s of c.sources){
   const matchedTerms=s.tags.filter(t=>m.tags.includes(t));
   if(s.section!==m.section||!matchedTerms.length){m.research.rejected.push({id:s.id,reason:s.section!==m.section?'different-section':'no-matching-term'});continue;}
   const note=new TextDecoder('utf-8',{fatal:true}).decode(pin(path.join(dir,s.file),s.sha256,2048)).trim();
   m.research.selected.push({id:s.id,section:s.section,sha256:s.sha256,matchedTerms,note});
  }
  m.research.selected.sort((a,b)=>b.matchedTerms.length-a.matchedTerms.length||a.id.localeCompare(b.id,'en'));
  if(m.research.selected.length<2)fail('DISTINCT_REVIEWED_SOURCES_REQUIRED');
 }
 return c;
}
function fitPack(m){
 const p=PACKS[m.id],q=decode(pin(fit(p),p.fit,4096));
 if(q.schema!=='MANA_INTEGER_EXAMPLES_V1'||q.id!==m.id||q.examples.length!==14||q.outputPower!==({mm:1,mm3:3})[m.unit]||!same(q.fields,m.fields.map(id=>({id,power:1,max:m.maxInput}))))fail('FIT_POLICY_MISMATCH');
 return q;
}
function runWorker(m){
 if(Number(process.versions.node.split('.')[0])<24)fail('NODE24_REQUIRED_FOR_RESTRICTED_CHILD');
 const p=PACKS[m.id];if(!p)fail('UNREVIEWED_TASK');
 const allow=[worker,launch,fit(p)];if(allow.some(x=>/[*,\r\n]/u.test(x)))fail('UNSAFE_PERMISSION_PATH');
 pin(worker,WORKER);pin(launch,LAUNCH);pin(fit(p),p.fit,4096);
 const args=['--permission',...allow.map(x=>'--allow-fs-read='+x),launch,worker,WORKER,fit(p),p.fit];
 const child=spawnSync(process.execPath,args,{cwd:packDir,env:{},stdio:['ignore','pipe','pipe'],timeout:13000,maxBuffer:16384,killSignal:'SIGKILL'});
 if(child.status!==0||child.error||!Buffer.isBuffer(child.stdout)||child.stdout.length===0)fail('WORKER_FAILED_NO_RETRY');
 // Runtime evidence has normal JSON integers only; duplicate keys are rejected.
 return decode(child.stdout);
}
function createNativeRd({workspace,masterPath}={}){
 const identity=privateDir(workspace);
 if(typeof masterPath!=='string'||[app,masterPath].some(x=>x===workspace||x.startsWith(workspace+path.sep)||workspace.startsWith(x+path.sep)))fail('SEPARATE_WORKSPACE_REQUIRED');
 const here=()=>payloadDigest([__filename,require.resolve('./mana-native-rd-verifier.cjs'),require.resolve('../approval-store.cjs'),require.resolve('../exact-json.cjs')].map(p=>sha(read(p))));
 const engineSha256=here(),file=n=>path.join(workspace,n),has=n=>exists(file(n)),load=n=>decode(read(file(n),64000,true));
 const current=()=>{if(!same(privateDir(workspace),identity)||engineSha256!==here())fail('ENGINE_OR_WORKSPACE_CHANGED');pin(worker,WORKER);pin(launch,LAUNCH);pin(require.resolve('../native/skill-expression.cjs'),EVALUATOR);};
 const readCtx=()=>{current();return catalog(masterPath);};
 function binding(c,m){fitPack(m);return {schema:S,mission:m.id,section:m.section,sectionSha256:m.sectionSha256,masterSha256:c.masterSha256,catalogSha256:CATALOG,taskSha256:payloadDigest(m),research:m.research,selection:'FIRST_REVIEWED_MISSION_WITHOUT_A_NATIVE_RECEIPT',selectionReasonFa:REASON_FA,workspace,identity,workerSha256:WORKER,launchSha256:LAUNCH,evaluatorSha256:EVALUATOR,engineSha256,packs:PACKS[m.id]};}
 function verify(c,m){
  const b=binding(c,m),claim=load(pathFor(m,'claim')),frozen=load(pathFor(m,'frozen'));
  if(!same(claim.binding,b)||claim.budget!==1||frozen.claimSha256!==payloadDigest(claim)||frozen.resultSha256!==payloadDigest(frozen.result))fail('UNVERIFIED_NATIVE_FREEZE');
  const p=PACKS[m.id];
  // The fresh test labels are opened only after a candidate/search diagnostic is frozen.
  const {verifyFrozen}=require('./mana-native-rd-verifier.cjs');
  const v=verifyFrozen(frozen.result,m,fitPack(m),decode(pin(fresh(p),p.fresh,8192)),p.fit,WORKER);
  const evidence={binding:b,frozenSha256:payloadDigest(frozen),candidateSha256:frozen.result.candidateSha256,...v,...SAFE};
  return {evidence,digest:payloadDigest(evidence)};
 }
 const allowed=new Set(['.lock',...Object.keys(PACKS).flatMap(id=>['claim','frozen','review'].map(k=>pathFor({id},k)))]);
 function checkNames(){if(fs.readdirSync(workspace).some(f=>!allowed.has(f)))fail('UNRECOGNIZED_WORKSPACE_STATE');}
 function select(c){
  const outcomes=[];
  checkNames();
  for(const [i,m]of c.missions.entries()){
   const after=()=>c.missions.slice(i+1).some(x=>['claim','frozen','review'].some(k=>has(pathFor(x,k))));
   const claim=has(pathFor(m,'claim')),frozen=has(pathFor(m,'frozen')),review=has(pathFor(m,'review'));
   if(!claim){if(frozen||review||after())fail('ORPHAN_NATIVE_RECEIPT');return {m,outcomes,what:'READY'};}
   if(!frozen){if(review||after())fail('ORPHAN_NATIVE_RECEIPT');return {m,outcomes,what:'UNKNOWN_OUTCOME_NO_RETRY'};}
   const r=verify(c,m);
   if(!review){if(after())fail('ORPHAN_NATIVE_RECEIPT');return {m,outcomes,what:'RESUME_VERIFICATION',r};}
   if(!same(load(pathFor(m,'review')),r))fail('CHANGED_NATIVE_REVIEW');
   outcomes.push({mission:m.id,status:r.evidence.status,digest:r.digest,score:r.evidence.score});
  }
  return {outcomes,what:'COMPLETE'};
 }
 function inspect(){if(has('.lock'))return {status:'UNKNOWN_OR_BUSY',...SAFE};const c=readCtx(),s=select(c);return {status:s.what,outcomes:s.outcomes,...(s.m?{mission:s.m.id,section:s.m.section,...(s.what==='READY'?{selectionReasonFa:REASON_FA}:s.what==='RESUME_VERIFICATION'?{selectionReasonFa:RESUME_FA}:{}),research:s.m.research}:{}),...SAFE};}
 function run(){
  current();if(Number(process.versions.node.split('.')[0])<24)fail('NODE24_REQUIRED_FOR_RESTRICTED_CHILD');
  checkNames();
  try{save(workspace,'.lock',{schema:S});}catch(e){if(e.code==='EEXIST')return {status:'UNKNOWN_OR_BUSY',workerRunsThisInvocation:0,...SAFE};throw e;}
  try{
   const c=readCtx(),s=select(c);
   if(!['READY','RESUME_VERIFICATION'].includes(s.what))return {status:s.what,outcomes:s.outcomes,workerRunsThisInvocation:0,...SAFE};
   const m=s.m;let r=s.r,count=0;
   if(!r){
    const claim={binding:binding(c,m),budget:1,at:new Date().toISOString()};save(workspace,pathFor(m,'claim'),claim);
    const result=runWorker(m);count=1;
    const next=readCtx(),now=next.missions.find(x=>x.id===m.id);
    if(!same(binding(next,now),claim.binding)||!same(load(pathFor(m,'claim')),claim))fail('EVIDENCE_CHANGED_NO_RETRY');
    save(workspace,pathFor(m,'frozen'),{claimSha256:payloadDigest(claim),resultSha256:payloadDigest(result),result});
    r=verify(next,now);
   }
   save(workspace,pathFor(m,'review'),r);
   return {status:r.evidence.status,...r,workerRunsThisInvocation:count,...SAFE};
  }finally{current();fs.unlinkSync(file('.lock'));sync(workspace);}
 }
 return {inspect,run};
}
module.exports={createNativeRd,runPinnedWorker:runWorker};
