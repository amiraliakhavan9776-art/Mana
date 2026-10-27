'use strict';
const {randomUUID}=require('node:crypto');
const {payloadDigest}=require('../approval-store.cjs');
// Trusted host facade. State services keep their own authorization and consent checks.
function createAuditedNativeServices({experience,recovery,review=null,costReview=null,scenarios=null,sensitivity=null,budgeting=null,budgetRanges=null,cashflow=null,artifactImpact=null,audit}={}){
 if(!experience||!['remember','recall','forget'].every(k=>typeof experience[k]==='function')||!recovery||typeof recovery.propose!=='function'||!audit||typeof audit.record!=='function')throw Error('Native services and audit sink required');
 if(review!==null&&!['request','decide','current'].every(k=>typeof review[k]==='function'))throw Error('Invalid recovery review service');
 if(costReview!==null&&!['request','decide','current'].every(k=>typeof costReview[k]==='function'))throw Error('Invalid cost review service');
 if(scenarios!==null&&typeof scenarios.compare!=='function')throw Error('Invalid recovery scenario service');
 if(sensitivity!==null&&typeof sensitivity.analyze!=='function')throw Error('Invalid schedule sensitivity service');
 if(budgeting!==null&&typeof budgeting.compare!=='function')throw Error('Invalid scenario budget service');
 if(budgetRanges!==null&&typeof budgetRanges.analyze!=='function')throw Error('Invalid budget range service');
 if(cashflow!==null&&typeof cashflow.analyze!=='function')throw Error('Invalid recovery cashflow service');
 if(artifactImpact!==null&&typeof artifactImpact.analyze!=='function')throw Error('Invalid artifact impact service');
 const services={experience,recovery,review,costReview,scenarios,sensitivity,budgeting,budgetRanges,cashflow,artifactImpact};
 function wrap(service,method,mutates){return async input=>{
  // Bind a private snapshot before awaiting an asynchronous audit sink.
  payloadDigest(input);const snapshot=JSON.parse(JSON.stringify(input)),inputDigest=payloadDigest(snapshot),operationId=randomUUID();
  const metadata={actorId:snapshot.principal?.id,orgId:snapshot.project?.orgId,projectId:snapshot.project?.id,action:'native:'+service+':'+method,requestId:operationId};
  const emit=async(outcome,digest)=>{await audit.record({...metadata,outcome,payloadDigest:digest});};
  try{await emit('intent',inputDigest);}catch{const error=Error('Audit unavailable; operation not started');error.code='AUDIT_INTENT_UNAVAILABLE';error.operationId=operationId;throw error;}
  let result;
  try{const value=await services[service][method](snapshot);payloadDigest(value);result=JSON.parse(JSON.stringify(value));}
  catch(error){
   try{await emit('operation_failed',inputDigest);}catch{const unavailable=Error('Audit failure after rejected operation; reconciliation required');unavailable.code='AUDIT_FAILURE_UNCONFIRMED';unavailable.operationId=operationId;throw unavailable;}
   throw error;
  }
  try{await emit('completed',payloadDigest(result));}
  catch{const error=Error(mutates?'Audit completion unconfirmed; state may have changed; reconcile before retry':'Audit completion unconfirmed; result withheld');error.code='AUDIT_COMPLETION_UNCONFIRMED';error.operationId=operationId;error.stateMayHaveChanged=mutates;throw error;}
  return result;
 };}
 const operations={experience:{remember:true,recall:false,forget:true},recovery:{propose:false}};
 if(review!==null)operations.review={request:true,decide:true,current:false};
 if(costReview!==null)operations.costReview={request:true,decide:true,current:false};
 if(scenarios!==null)operations.scenarios={compare:false};
 if(sensitivity!==null)operations.sensitivity={analyze:false};
 if(budgeting!==null)operations.budgeting={compare:false};
 if(budgetRanges!==null)operations.budgetRanges={analyze:false};
 if(cashflow!==null)operations.cashflow={analyze:false};
 if(artifactImpact!==null)operations.artifactImpact={analyze:false};
 return Object.freeze(Object.fromEntries(Object.entries(operations).map(([service,methods])=>[service,Object.freeze(Object.fromEntries(Object.entries(methods).map(([method,mutates])=>[method,wrap(service,method,mutates)])))])));
}
module.exports={createAuditedNativeServices};
