'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash,randomBytes}=require('node:crypto');
const {parseExactJSON}=require('../exact-json.cjs');
const {validateExpression,evaluateExpression}=require('../native/skill-expression.cjs');
const {createApprovalStore,payloadDigest}=require('../approval-store.cjs');
const V='MANA_RD_PILOT_V1',OPS=['add','subtract','multiply','min','max'];
const ORG='mana_rd_private',OWNER={id:'workspace_owner',orgId:ORG},ADVISER={id:'local_adviser',orgId:ORG};
const action='activate-synthetic-skill',projectId='rd-private',toolVersion='rd-pilot-v1';
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
function createWorkbench(config){
 const {workspace,catalogPath,catalogSha256,masterPath}=config;
 const identity=privateDir(workspace),repo=path.resolve(__dirname,'../..');
 if([repo,catalogPath,masterPath].some(p=>p===workspace||p.startsWith(workspace+path.sep)||workspace.startsWith(p+path.sep)))fail('ISOLATE_WORKSPACE_FROM_SOURCE');
 const source=()=>payloadDigest([__filename,require.resolve('../native/skill-expression.cjs'),require.resolve('../exact-json.cjs'),require.resolve('../approval-store.cjs'),require.resolve('../encrypted-state.cjs')].map(p=>sha(read(p,128000))));
 const initial=source(),file=n=>path.join(workspace,n),has=n=>exists(file(n)),get=n=>json(read(file(n),64000,true));
 const put=(n,x)=>{current();save(workspace,n,x);};
 const load=()=>readCatalog({catalogPath,catalogSha256,masterPath});
 function current(){if(!same(identity,privateDir(workspace))||initial!==source())fail('WORKSPACE_OR_ENGINE_CHANGED');}
 const locked=async fn=>{current();put('.lock',{schema:V});try{return await fn();}finally{current();fs.unlinkSync(file('.lock'));sync(workspace);}};
 const name=(m,s)=>m.id+'-'+s+'.json';
 function binding(c,m,p){return {schema:V,mission:m.id,catalogSha256,masterSha256:c.masterSha256,section:m.section,sectionSha256:m.sectionSha256,fields:m.fields,goal:m.goal,outputUnit:m.unit,maxInput:m.maxInput,selection:{policy:'first-unattempted-reviewed-catalog-mapping',priority:c.missions.findIndex(x=>x.id===m.id)+1},taskSha256:payloadDigest(m),evidence:p,engineSha256:initial,workspace,identity};}
 function review(m,c){
  current();const claim=get(name(m,'claim')),r=get(name(m,'review')),e=r.evidence,sources=retrieve(c,m,catalogPath);
  if(!exact(r,['evidence','digest'])||r.digest!==payloadDigest(e)||!same(claim.binding,binding(c,m,sources))||!same(e.binding,claim.binding)||e.claimSha256!==payloadDigest(claim)||e.activationAuthorized!==false)fail('UNVERIFIED_REVIEW');
  if(e.candidate===null){if(e.score!==null||!['PROVIDER_UNAVAILABLE','INVALID_PROPOSAL'].includes(e.status))fail('UNVERIFIED_REVIEW');}
  else{const score=measure(candidate(JSON.stringify(e.candidate),m),m);if(!same(score,e.score)||e.status!==(score.passed===score.total?'AWAITING_HUMAN_REVIEW':'BENCHMARK_FAILED'))fail('CHANGED_REVIEW');}
  return r;
 }
 function select(c){
  const outcomes=[];
  for(const m of c.missions){
   if(!has(name(m,'claim'))){if(has(name(m,'review')))fail('ORPHAN_REVIEW');return {m,outcomes};}
   if(!has(name(m,'review')))return {blocked:m.id,outcomes};
   outcomes.push({mission:m.id,status:review(m,c).evidence.status});
  }
  return {outcomes};
 }
 function choose(c,id,digest){if(!hash(digest))fail('EXPLICIT_CANDIDATE_DIGEST_REQUIRED');const m=c.missions.find(x=>x.id===id);if(!m)fail('MISSION_NOT_FOUND');const r=review(m,c);if(r.digest!==digest||r.evidence.status!=='AWAITING_HUMAN_REVIEW')fail('CANDIDATE_NOT_APPROVABLE');return {m,r};}
 function approvals(make=false){if(make&&!has('approval-key.json'))put('approval-key.json',{key:randomBytes(32).toString('hex')});const x=get('approval-key.json');if(!exact(x,['key'])||!hash(x.key))fail('INVALID_APPROVAL_KEY');return createApprovalStore({file:file('approvals.bin'),key:Buffer.from(x.key,'hex'),authorize:(p,op)=>op==='request'?p.id===ADVISER.id:p.id===OWNER.id});}
 const bindingFor=r=>({action,projectId,resourceId:r.digest,dataVersion:r.evidence.binding.taskSha256,toolVersion,payload:r.evidence});
 function active(m,r){const active=get(name(m,'active')),a=approvals().inspect({principal:OWNER,approvalId:active.approvalId});if(active.digest!==r.digest||a.status!=='succeeded'||a.approverId!==OWNER.id||a.action!==action||a.projectId!==projectId||a.resourceId!==r.digest||a.dataVersion!==r.evidence.binding.taskSha256||a.toolVersion!==toolVersion||a.payloadDigest!==payloadDigest(r.evidence))fail('UNVERIFIED_PRIVATE_ACTIVATION');}
 return {
  inspect(){current();if(has('.lock'))return {status:'UNKNOWN_OR_BUSY'};const c=load(),s=select(c);return {status:s.blocked?'UNKNOWN_OUTCOME':s.m?'READY':'COMPLETE',outcomes:s.outcomes,...(s.m?{next:s.m.id,section:s.m.section,reason:'First reviewed master mapping without a prior proposal in catalog order',research:retrieve(c,s.m,catalogPath)}:{}),...(s.blocked?{blocked:s.blocked}:{})};},
  proposeNext({propose,providerId,transportSha256=null}={}){return locked(async()=>{
   if(typeof propose!=='function'||typeof providerId!=='string'||!providerId.trim()||providerId.length>160||transportSha256!==null&&!hash(transportSha256))fail('EXPLICIT_LOCAL_ADVISER_REQUIRED');
   const c=load(),s=select(c);if(s.blocked)fail('UNKNOWN_OUTCOME_NO_RETRY');if(!s.m)return {status:'COMPLETE',modelRequestsAttempted:0};
   const m=s.m,b=binding(c,m,retrieve(c,m,catalogPath)),claim={binding:b,providerId,transportSha256,at:new Date().toISOString()};put(name(m,'claim'),claim);
   let raw,x=null,score=null,status;
   try{raw=await propose({goal:m.goal,fields:[...m.fields],outputUnit:m.unit,maxInput:m.maxInput,notes:b.evidence.selected.map(s=>s.note),grammar:grammar(m.fields)});}catch{status='PROVIDER_UNAVAILABLE';}
   if(!status){try{x=candidate(raw,m);score=measure(x,m);status=score.passed===score.total?'AWAITING_HUMAN_REVIEW':'BENCHMARK_FAILED';}catch{status='INVALID_PROPOSAL';x=null;score=null;}}
   if(!same(b,binding(load(),m,retrieve(load(),m,catalogPath))))fail('EVIDENCE_CHANGED_NO_RETRY');
   const evidence={binding:b,status,candidate:x,score,claimSha256:payloadDigest(claim),activationAuthorized:false};
   const r={evidence,digest:payloadDigest(evidence)};put(name(m,'review'),r);return {...r,modelRequestsAttempted:1};
  });},
  review(id){if(has('.lock'))fail('UNKNOWN_OR_BUSY');const c=load(),m=c.missions.find(x=>x.id===id);if(!m)fail('MISSION_NOT_FOUND');return review(m,c);},
  approve({id,digest,reason}){return locked(async()=>{const {m,r}=choose(load(),id,digest);if(typeof reason!=='string'||!reason.trim()||reason.length>300||has(name(m,'approve-intent'))||has(name(m,'deactivated')))fail('EXPLICIT_OWNER_APPROVAL_REQUIRED');put(name(m,'approve-intent'),{digest});const store=approvals(true),a=store.request({principal:ADVISER,...bindingFor(r),ttlMs:3600000});store.decide({principal:OWNER,approvalId:a.id,approve:true,reason});put(name(m,'approved'),{digest,approvalId:a.id});return {status:'APPROVED_NOT_ACTIVE',digest};});},
  activate({id,digest}){return locked(async()=>{const {m,r}=choose(load(),id,digest),a=get(name(m,'approved'));if(a.digest!==digest||has(name(m,'activation-intent'))||has(name(m,'deactivated')))fail('ACTIVATION_UNAVAILABLE');put(name(m,'activation-intent'),{digest});const store=approvals();store.claim({principal:OWNER,approvalId:a.approvalId,...bindingFor(r),idempotencyKey:digest});put(name(m,'active'),a);store.finish({principal:OWNER,approvalId:a.approvalId,outcome:'succeeded'});return {status:'ACTIVE_PRIVATE_SYNTHETIC_ONLY',digest};});},
  run({id,digest,values}){return locked(async()=>{const {m,r}=choose(load(),id,digest);if(has(name(m,'deactivated')))fail('DEACTIVATED');active(m,r);if(!Array.isArray(values)||values.length!==m.fields.length||values.some(x=>!Number.isSafeInteger(x)||x<0||x>m.maxInput))fail('EXACT_SYNTHETIC_INTEGER_INPUT_REQUIRED');return {status:'EXECUTED_PRIVATE_SYNTHETIC_ONLY',mission:id,digest,output:runExact(r.evidence.candidate,m,values),unit:m.unit,modelCalls:0,productionAllowed:false};});},
  deactivate({id,digest,reason}){return locked(async()=>{const {m,r}=choose(load(),id,digest);if(typeof reason!=='string'||!reason.trim()||reason.length>300)fail('EXPLICIT_OWNER_REASON_REQUIRED');active(m,r);put(name(m,'deactivated'),{digest,reason});return {status:'DEACTIVATED',digest};});}
 };
}
module.exports={createWorkbench};
