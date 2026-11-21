'use strict';
const {validateExpression,evaluateExpression}=require('../native/skill-expression.cjs');
const {payloadDigest}=require('../approval-store.cjs');
const {createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
const hashAst=x=>hash(JSON.stringify(x));
function verifyFrozen(r,m,pack,fresh,fitSha256,workerSha256){
 const form=r&&r.schema==='MANA_NATIVE_SYNTHESIS_RESULT_V1'&&r.task===m.id&&r.workerSha256===workerSha256&&r.trainingFileSha256===fitSha256&&r.trainingSha256===hashAst(pack)&&r.trainingExampleCount===pack.examples.length&&r.outputPower===({mm:1,mm3:3})[m.unit]&&payloadDigest(r.fields)===payloadDigest(pack.fields)&&r.modelCalls===0&&r.activationAuthorized===false&&r.modelTrainingPerformed===false;
 if(!form||!r.search||typeof r.search.truncated!=='boolean'||!Number.isSafeInteger(r.search.matchedBehaviorClasses)||r.search.matchedBehaviorClasses<0||!Number.isSafeInteger(r.search.maxNodesReached)||r.search.maxNodesReached<1||r.search.maxNodesReached>11||r.search.maxNodes!==11||r.search.maxCombinations!==2000000||r.search.maxStates!==145000||r.search.maxMs!==7000)throw Error('INVALID_FROZEN_SEARCH_RECEIPT');
 if(r.search.truncated)return {status:'TRUNCATED_REFUSED',score:null};
 if(r.status==='NO_MATCH_WITHIN_NODE_LIMIT'&&r.search.matchedBehaviorClasses===0&&r.candidate===null&&r.candidateSha256===null)return {status:'NO_MATCH',score:null};
 if(r.status!=='FROZEN_FOR_INDEPENDENT_TESTS'||r.search.matchedBehaviorClasses<1||r.candidate===null||r.candidateSha256!==hashAst(r.candidate)||r.search.reason!=='FIRST_MATCH_SIZE_FINISHED')throw Error('INVALID_FROZEN_CANDIDATE');
 if(r.search.matchedBehaviorClasses!==1||r.search.ambiguity!=='NO_DIFFERENCE_OBSERVED_NOT_UNIQUENESS')return {status:'AMBIGUOUS_REFUSED',score:null};
 if(fresh.schema!=='MANA_NATIVE_SYNTHESIS_QA_FIXTURE_V1'||fresh.kind!=='FRESH_HOLDOUT'||fresh.mission!==m.id||fresh.unit!==m.unit||fresh.maxInput!==m.maxInput||payloadDigest(fresh.fields)!==payloadDigest(m.fields)||fresh.examples.length!==16||m.tests.length!==8)throw Error('FROZEN_SUITE_MISMATCH');
 const all=[...pack.examples,...m.tests,...fresh.examples];const seen=new Set();for(const [x,y]of all){const key=JSON.stringify(x);if(!Array.isArray(x)||x.length!==m.fields.length||x.some(n=>!Number.isSafeInteger(n)||n<0||n>m.maxInput)||!Number.isSafeInteger(y)||y<0||y>1e12||seen.has(key))throw Error('SPLIT_OVERLAP_OR_INVALID');seen.add(key);}
 validateExpression(r.candidate,m.fields);
 let nodes=0;function units(x){
  if(++nodes>11)throw Error('CANDIDATE_NODE_LIMIT');
  if(Object.hasOwn(x,'field'))return [pack.fields.find(f=>f.id===x.field).power];
  if(Object.hasOwn(x,'value')){if(!Number.isInteger(x.value)||x.value<0||x.value>4)throw Error('CANDIDATE_LITERAL_LIMIT');return x.value===0?[0,1,2,3]:[0];}
  if(!['add','subtract','multiply','min','max'].includes(x.op))throw Error('CANDIDATE_OPERATOR');
  const [l,q]=x.args.map(units),powers=new Set();
  for(const a of l)for(const b of q){if(x.op==='multiply'&&a+b<=3)powers.add(a+b);else if(x.op!=='multiply'&&a===b)powers.add(a);}
  return [...powers];
 }
 if(!units(r.candidate).includes(r.outputPower)||nodes!==r.search.maxNodesReached)throw Error('INVALID_CANDIDATE_UNITS_OR_SIZE');
 function run(v){const n=evaluateExpression(r.candidate,Object.fromEntries(m.fields.map((f,i)=>[f,v[i]])),m.fields);if(!Number.isSafeInteger(n)||n<0||n>1e12)throw Error('BAD_RESULT');return n;}
 const insensitive=m.fields.filter((_,i)=>[1,2,3].some(k=>{
  const a=m.anchors.map(t=>t*k),b=[...a];b[i]+=3*k;try{return run(a)===run(b);}catch{return true;}
 }));
 const tally=rows=>rows.filter(([v,want])=>{try{return run(v)===want;}catch{return false;}}).length;
 if(tally(pack.examples)!==pack.examples.length)throw Error('FROZEN_CANDIDATE_DID_NOT_FIT');
 const score={insensitive,regression:{passed:insensitive.length?0:tally(m.tests),total:8},fresh:{passed:insensitive.length?0:tally(fresh.examples),total:16},testsRun:insensitive.length?0:24,unit:m.unit,regressionSha256:payloadDigest({anchors:m.anchors,tests:m.tests})};
 return {status:score.regression.passed===8&&score.fresh.passed===16?'AWAITING_HUMAN_REVIEW':'BENCHMARK_FAILED',score};
}
module.exports={verifyFrozen};
