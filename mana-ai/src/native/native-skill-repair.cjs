'use strict';
/**
 * MANA V12: bounded, model-independent skill repair search.
 * Candidates never execute on the host. Only a caller-provided independent
 * sandbox verifier can accept a candidate. Review remains mandatory.
 */
const {compile,validate}=require('./native-skill-compiler.cjs');
const {createHash}=require('node:crypto');
const sha = value => createHash('sha256').update(value).digest('hex');
const OPERATORS=['add','subtract','multiply','divide','min','max','gt','gte','lt','lte','eq'];
const isObject = x => x!==null&&typeof x==='object'&&!Array.isArray(x);
const copy = x => JSON.parse(JSON.stringify(x));
function enumerateMutations(expression,limit=64){
 if(!Number.isInteger(limit)||limit<1||limit>128)throw Error('Invalid candidate bound');
 const found=[];
 function visit(node,path,depth){
  if(found.length>=limit||depth>14||!isObject(node))return;
  if(typeof node.op==='string'&&Array.isArray(node.args)){
   for(const op of OPERATORS){
    if(op===node.op)continue;
    const mutant=copy(expression);let target=mutant;
    for(const k of path)target=target[k];target.op=op;
    found.push(mutant);if(found.length>=limit)return;
   }
   for(let i=0;i<node.args.length;i++)visit(node.args[i],[...path,'args',i],depth+1);
  }
  if(node.if){visit(node.if,[...path,'if'],depth+1);visit(node.then,[...path,'then'],depth+1);visit(node.else,[...path,'else'],depth+1)}
 }
 visit(expression,[],0);
 return found;
}
/**
 * verifier receives ({source, sourceSha256, vectorCount, candidateIndex}) and
 * MUST execute owner-owned acceptance tests inside an independently verified
 * sandbox. Receipt must carry a SHA256 of the trusted test source.
 */
async function repairNativeSkill({spec,verifier,maxCandidates=24,signal}={}){
 validate(spec);
 if(typeof verifier!=='function')throw Error('Independent sandbox verifier required');
 if(!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>64)throw Error('Invalid repair bound');
 const original=compile(spec),evidence=[];
 const variants=[spec.expression,...enumerateMutations(spec.expression,maxCandidates-1)];
 const seen=new Set();
 for(const expression of variants){
  if(signal?.aborted)return Object.freeze({schema:'MANA_NATIVE_REPAIR_V1',status:'CANCELLED',attempts:evidence,approved:false,productionDeploymentAllowed:false});
  const candidate=copy({...spec,expression});
  let draft;
  try{draft=compile(candidate)}catch{continue}
  if(seen.has(draft.sourceSha256))continue;seen.add(draft.sourceSha256);
  const index=evidence.length;
  let checked;
  try{checked=await verifier({source:draft.source,sourceSha256:draft.sourceSha256,vectorCount:spec.tests.length,candidateIndex:index})}
  catch(e){checked={status:'SANDBOX_UNAVAILABLE',executed:false,passed:false,summary:'verifier exception'}}
  const allowed=checked&&['PASSED','FAILED','SANDBOX_UNAVAILABLE'].includes(checked.status)
     &&typeof checked.executed==='boolean'&&typeof checked.passed==='boolean';
  if(!allowed)throw Error('Malformed sandbox verification receipt');
  const receipt={candidateIndex:index,sourceSha256:draft.sourceSha256,status:checked.status,executed:checked.executed,passed:checked.passed,testSha256:checked.testSha256??null};
  evidence.push(receipt);
  if(checked.status==='SANDBOX_UNAVAILABLE'||checked.executed!==true){
   return Object.freeze({schema:'MANA_NATIVE_REPAIR_V1',status:'SANDBOX_UNAVAILABLE',attempts:evidence,approved:false,productionDeploymentAllowed:false});
  }
  if(checked.status==='PASSED'&&checked.passed===true){
   if(!/^[a-f0-9]{64}$/.test(checked.testSha256??''))throw Error('Independent test digest missing');
   if(checked.sourceSha256!==draft.sourceSha256)throw Error('Verified source digest mismatch');
   return Object.freeze({schema:'MANA_NATIVE_REPAIR_V1',status:'PASSED_AWAITING_HUMAN_REVIEW',originalSha256:original.sourceSha256,sourceSha256:draft.sourceSha256,testSha256:checked.testSha256,candidateIndex:index,proposedExpression:copy(expression),candidateSource:draft.source,attempts:evidence,humanReviewRequired:true,approved:false,productionDeploymentAllowed:false});
  }
  if(checked.status!=='FAILED'||checked.passed!==false)throw Error('Inconsistent sandbox verification receipt');
 }
 return Object.freeze({schema:'MANA_NATIVE_REPAIR_V1',status:'NO_VERIFIED_REPAIR',originalSha256:original.sourceSha256,attempts:evidence,approved:false,productionDeploymentAllowed:false});
}
module.exports={repairNativeSkill,enumerateMutations};
