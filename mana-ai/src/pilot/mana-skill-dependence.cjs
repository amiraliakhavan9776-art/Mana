'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {parseExactJSON}=require('../exact-json.cjs');
const {validateExpression,evaluateExpression}=require('../native/skill-expression.cjs');
const {createBoundedLocalCompletion}=require('./mana-text-model.cjs');
const {createManaSkillPilot}=require('./mana-skill-pilot.cjs');
const SKILL='synthetic-trim-dependence-v1',COMMAND='آزمایش وابستگی مهارت متره',RECEIPT_COMMAND='رسید وابستگی مهارت متره',FIELDS=Object.freeze(['first_mm','second_mm']);
const SYSTEM='Return only one JSON expression, no prose, code fences or programs. Nodes: {"field":"allowed_name"}, {"value":integer}, or {"op":"add|subtract|multiply|min|max","args":[node,node]}. Use only the supplied fields. No other operations, tools or access. Keep the expression short.';
const FEEDBACK='Previous proposal failed because its output did not depend on the independently supplied measurements. Make both named inputs influence the result; do not replace either measurement with a fixed value.';
const PROMPT='Propose a synthetic quantity expression for the total length of exactly two independently entered trim pieces. Each source length is nonnegative metres; each input variable holds its already converted integer millimetres, from 0 to 100000 mm inclusive. Return the total as integer millimetres, without further scaling. Inputs: first_mm, second_mm. No waste, pricing, material selection, or physical action.';
// GBNF constrains structure only. It does not encode the correct operation or fixtures.
function grammar(){
 const q=JSON.stringify,ops=['add','subtract','multiply','min','max'].map(op=>q(q(op))).join(' | ');
 const leaf=[...FIELDS.map(name=>q(JSON.stringify({field:name}))),q('{"value":')+' integer '+q('}')].join(' | ');
 const rules=['root ::= n4','integer ::= "-"? ("0" | [1-9] [0-9]{0,8})','n0 ::= '+leaf];
 for(let i=1;i<=4;i++){const n='n'+(i-1);rules.push('n'+i+' ::= n0 | '+q('{"op":')+' ('+ops+') '+q(',"args":[')+' '+n+' '+q(',')+' '+n+' '+q(']}'));}
 return rules.join('\n');
}
const SUITE=[[0,0,0],[0,4207,4207],[115,0,115],[100,200,300],[353,691,1044],[999,1001,2000],[27775,33333,61108],[100000,1,100001],[1,100000,100001],[100000,100000,200000]];
// Independently varied only one field at a time. These local probes test
// numerical dependence at selected contexts; they do not prove it universally.
const PROBES=[[17,41,113],[731,2089,3101],[5197,8581,23339],[37719,54513,60043]];
const PRIOR_CANDIDATE='76fa77a31283df9e2875e8db881b6fb76c0f52f894dbe5e4ef0bfb5ee9c1c276';
const PINNED={
 './mana-skill-pilot.cjs':'0dbd5c5e7437347c100c26fe86852eb226362265127b4f368deaacccaf078d06',
 './mana-text-model.cjs':'a8e22dca2c2c0915294d1baeec2b50c6caa0ffcf95d60141bf29b1165d0e6558',
 '../native/skill-expression.cjs':'1241583c48b400833938799ea5538a7585cd8862444c930fea0b580741829261',
 '../exact-json.cjs':'6991fc39b917fea5441df51fa1d7c7fea9449de9ecc3839dd827127b4f7bca2b'
};
const safe={activated:false,productionDeploymentAllowed:false,modelTrainingPerformed:false};
const sha=x=>createHash('sha256').update(x).digest('hex'),digest=x=>sha(JSON.stringify(x));
const boundedHash=/^[a-f0-9]{64}$/;
const keys=(x,k)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...k].sort().join(',');
function same(a,b){return digest(a)===digest(b);}
function sourceIdentity(){return digest([__filename,require.resolve('../native/skill-expression.cjs'),require.resolve('../exact-json.cjs'),require.resolve('./mana-text-model.cjs'),require.resolve('./mana-skill-pilot.cjs')].map(p=>sha(fs.readFileSync(p))));}
function workspaceCheck(workspace){
 if(typeof workspace!=='string'||!path.isAbsolute(workspace)||path.resolve(workspace)!==workspace||fs.realpathSync(workspace)!==workspace)throw Error('Private skill workspace required');
 const s=fs.lstatSync(workspace),repo=path.resolve(__dirname,'../..');if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)||(process.getuid&&s.uid!==process.getuid())||workspace===repo||workspace.startsWith(repo+path.sep)||repo.startsWith(workspace+path.sep))throw Error('Separate private skill workspace required');
 return {dev:s.dev,ino:s.ino};
}
function exists(file){try{fs.lstatSync(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function read(file,raw=false){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);try{const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size<1||s.size>32768||(s.mode&0o077)||(process.getuid&&s.uid!==process.getuid()))throw Error('Unsafe skill evidence');const bytes=fs.readFileSync(fd);return raw?bytes:parseExactJSON(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}finally{fs.closeSync(fd);}}
function sync(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function claimDurably(dir,file,doc){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(doc)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}sync(dir);}
function publish(dir,file,doc){const tmp=path.join(dir,'.receipt-'+randomUUID());try{claimDurably(dir,tmp,doc);fs.linkSync(tmp,file);fs.unlinkSync(tmp);sync(dir);}finally{if(exists(tmp))fs.unlinkSync(tmp);}}
function measure(expression){
 validateExpression(expression,FIELDS);
 function check(node,depth=0){if(depth>4)throw Error('Pilot expression depth');if(Object.hasOwn(node,'field'))return;if(Object.hasOwn(node,'value')){if(!Number.isSafeInteger(node.value)||Math.abs(node.value)>999999999)throw Error('Integer literal required');return;}if(!['add','subtract','multiply','min','max'].includes(node.op))throw Error('Numeric pilot operation required');node.args.forEach(x=>check(x,depth+1));}
 check(expression);
 const candidateSha256=digest(expression),used=new Set();
 function visit(node){if(Object.hasOwn(node,'field'))used.add(node.field);else node.args?.forEach(visit);}
 visit(expression);
 const insensitive=FIELDS.filter(field=>{
  if(!used.has(field))return true;
  const other=FIELDS.find(k=>k!==field);
  return PROBES.some(([a,b,c])=>{try{
   const x=evaluateExpression(expression,{[field]:a,[other]:c},FIELDS),y=evaluateExpression(expression,{[field]:b,[other]:c},FIELDS);
   return !Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x>200000||y>200000||x===y;
  }catch{return true;}});
 });
 if(insensitive.length)return {status:'DEPENDENCE_REJECTED',passed:0,total:SUITE.length,testsRun:0,candidateSha256,expression,insensitive};
 let passed=0;
 for(const [first_mm,second_mm,expected]of SUITE){try{if(evaluateExpression(expression,{first_mm,second_mm},FIELDS)===expected)passed++;}catch{/* invalid arithmetic for a case fails that case */}}
 return {status:passed===SUITE.length?'PASSED_AWAITING_REVIEW':'BENCHMARK_FAILED',passed,total:SUITE.length,testsRun:SUITE.length,candidateSha256:digest(expression),expression};
}
function evaluate(text){
 if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>4096)return {status:'INVALID_PROPOSAL',passed:0,total:SUITE.length,testsRun:0,candidateSha256:null,expression:null};
 try{return measure(parseExactJSON(text));}catch{return {status:'INVALID_PROPOSAL',passed:0,total:SUITE.length,testsRun:0,candidateSha256:null,expression:null};}
}
function unavailable(){return {...evaluate(null),status:'PROVIDER_UNAVAILABLE'};}
function createDependenceProposal({model,port}){
 const complete=createBoundedLocalCompletion({model,port,timeoutMs:30000},SYSTEM,grammar());
 return async ()=>{const r=await complete({text:PROMPT+' ' +FEEDBACK});if(r.status!=='TEXT_ANSWER')throw Error('No verified model response');return r.text;};
}
function createManaSkillDependencePilot({workspace,priorWorkspace,propose,providerId='injected-local-test',priorProviderId=providerId}={}){
 if(typeof priorProviderId!=='string'||priorProviderId.length<1||priorProviderId.length>160)throw Error('Explicit prior provider identity required');
 const priorIdentity=workspaceCheck(priorWorkspace);
 if(typeof workspace!=='string'||workspace===priorWorkspace||workspace.startsWith(priorWorkspace+path.sep)||priorWorkspace.startsWith(workspace+path.sep))throw Error('Separate skill workspaces required');
 function verifyPrior(){
  const actual=workspaceCheck(priorWorkspace);if(actual.dev!==priorIdentity.dev||actual.ino!==priorIdentity.ino)throw Error('Historical workspace changed');
  for(const [name,hash] of Object.entries(PINNED))if(sha(fs.readFileSync(require.resolve(name)))!==hash)throw Error('Unreviewed historical source');
  const files=['claim.json','receipt.json'].map(name=>path.join(priorWorkspace,name));
  const before=files.map(f=>sha(read(f,true)));
  const old=createManaSkillPilot({workspace:priorWorkspace,providerId:priorProviderId,propose:()=>{throw Error('Read-only historical verifier');}}).inspect();
  const after=files.map(f=>sha(read(f,true)));
  if(!same(before,after)||old.status!=='BENCHMARK_FAILED'||old.passed!==1||old.total!==10||old.testsRun!==10||old.candidateSha256!==PRIOR_CANDIDATE||digest(old.expression)!==PRIOR_CANDIDATE)throw Error('Historical failure not verified');
  return digest(before);
 }
 if(typeof propose!=='function'||typeof providerId!=='string'||providerId.length<1||providerId.length>160)throw Error('Explicit proposal provider required');
 const identity=workspaceCheck(workspace);
 const source=sourceIdentity();
 const bind=priorEvidence=>digest({skill:SKILL,suite:SUITE,probes:PROBES,source,providerId,priorProviderId,workspace,identity,priorWorkspace,priorIdentity,priorEvidence,prompt:PROMPT,feedback:FEEDBACK,system:SYSTEM});
 const claimFile=path.join(workspace,'claim.json'),receiptFile=path.join(workspace,'receipt.json');
 const current=()=>{const actual=workspaceCheck(workspace);if(actual.dev!==identity.dev||actual.ino!==identity.ino)throw Error('Skill workspace changed');if(sourceIdentity()!==source)throw Error('Skill source changed');};
 function inspect(){
  try{
   current();let priorEvidence;try{priorEvidence=verifyPrior();}catch{return {status:'PRIOR_EVIDENCE_BLOCKED',...safe};}
   const binding=bind(priorEvidence),entries=fs.readdirSync(workspace);
   if(entries.some(x=>!['claim.json','receipt.json'].includes(x)))return {status:'UNKNOWN_OUTCOME',...safe};
   if(!entries.length)return {status:'READY',priorEvidence,...safe};
   if(!entries.includes('claim.json'))return {status:'UNKNOWN_OUTCOME',...safe};
   const claim=read(claimFile);
   if(!keys(claim,['schema','skill','binding','startedAt','nonce','budget'])||claim.schema!=='MANA_SKILL_DEPENDENCE_CLAIM_V1'||claim.skill!==SKILL||claim.binding!==binding||claim.budget!==1||typeof claim.startedAt!=='string'||typeof claim.nonce!=='string'||!/^[-a-f0-9]{36}$/.test(claim.nonce))return {status:'UNKNOWN_OUTCOME',...safe};
   if(!exists(receiptFile))return {status:'UNKNOWN_OUTCOME',...safe};
   const receipt=read(receiptFile),r=receipt.result;
   if(!keys(receipt,['schema','claimSha256','resultSha256','result'])||receipt.schema!=='MANA_SKILL_DEPENDENCE_RECEIPT_V1'||receipt.claimSha256!==digest(claim)||receipt.resultSha256!==digest(r)||!keys(r,['status','passed','total','testsRun','candidateSha256','expression',...(r.status==='DEPENDENCE_REJECTED'?['insensitive']:[])]))return {status:'UNKNOWN_OUTCOME',...safe};
   const expected=r.status==='PROVIDER_UNAVAILABLE'?unavailable():r.status==='INVALID_PROPOSAL'?evaluate(null):measure(r.expression);
   if(!same(r,expected)||r.candidateSha256!==null&&!boundedHash.test(r.candidateSha256))return {status:'UNKNOWN_OUTCOME',...safe};
   return {...r,reused:true,modelCallsThisInvocation:0,...safe};
  }catch{return {status:'UNKNOWN_OUTCOME',...safe};}
 }
 async function run(){
  const prior=inspect();if(prior.status!=='READY')return prior;
  const binding=bind(prior.priorEvidence);
  const claim={schema:'MANA_SKILL_DEPENDENCE_CLAIM_V1',skill:SKILL,binding,startedAt:new Date().toISOString(),nonce:randomUUID(),budget:1};
  try{current();claimDurably(workspace,claimFile,claim);current();if(verifyPrior()!==prior.priorEvidence)throw Error('Historical evidence changed');}catch{return {status:'UNKNOWN_OUTCOME',...safe};}
  let result;try{result=evaluate(await propose());}catch{result=unavailable();}
  try{current();if(verifyPrior()!==prior.priorEvidence||!same(read(claimFile),claim)||exists(receiptFile))throw Error('Skill claim changed');publish(workspace,receiptFile,{schema:'MANA_SKILL_DEPENDENCE_RECEIPT_V1',claimSha256:digest(claim),resultSha256:digest(result),result});}
  catch{return {status:'UNKNOWN_OUTCOME',modelCallsThisInvocation:1,...safe};}
  return {...result,reused:false,modelCallsThisInvocation:1,...safe};
 }
 return {inspect,run};
}
module.exports={createManaSkillDependencePilot,createDependenceProposal,COMMAND,RECEIPT_COMMAND};
