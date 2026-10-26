'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {createEncryptedState}=require('./encrypted-state.cjs');
const ID=/^[A-Za-z0-9_-]{1,100}$/;
function payloadDigest(payload){
 // Canonical JSON: reject values that could disappear or change in serialization.
 let nodes=0;
 function canonical(value,depth=0){
  if(++nodes>4096||depth>32)throw Error('Approval payload too complex');
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value)){
   if(value.length>4096)throw Error('Approval payload too complex');
   for(let i=0;i<value.length;i++)if(!Object.hasOwn(value,i))throw Error('Sparse approval payload');
   return '['+value.map(v=>canonical(v,depth+1)).join(',')+']';
  }
  if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k],depth+1)).join(',')+'}';
  throw Error('Payload must be finite plain JSON');
 }
 const serialized=canonical(payload);
 if(Buffer.byteLength(serialized)>16384)throw Error('Approval payload too large');
 return createHash('sha256').update(serialized).digest('hex');
}
function createApprovalStore({file,key,authorize,now=Date.now}={}){
 if(typeof authorize!=='function'||typeof now!=='function')throw Error('Trusted authorization and clock required');
 const store=createEncryptedState({file,key,kind:'MANA_APPROVALS_V1'});
 function check(principal,operation,record){
  if(!principal||typeof principal.id!=='string'||typeof principal.orgId!=='string'||!ID.test(principal.id)||!ID.test(principal.orgId)||principal.orgId!==record.orgId||authorize(principal,operation,{...record})!==true)throw Error('Approval permission denied');
 }
 function transaction(update){return store.transact(state=>{
  if(state===null)state={version:1,records:[]};
  if(state.version!==1||!Array.isArray(state.records))throw Error('Invalid approval state');
  return update(state);
 })}
 function instant(){const value=now();if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid approval clock');return value}
 return Object.freeze({
  request({principal,action,projectId,resourceId,dataVersion,toolVersion,payload,ttlMs=300000}){
   if(![projectId,resourceId,dataVersion,toolVersion].every(x=>typeof x==='string'&&ID.test(x))||typeof action!=='string'||!action||action.length>100||!Number.isInteger(ttlMs)||ttlMs<1000||ttlMs>3600000)throw Error('Invalid approval request');
   const issuedAt=instant();
   const record={id:randomUUID(),orgId:principal?.orgId,requesterId:principal?.id,action,projectId,resourceId,dataVersion,toolVersion,payloadDigest:payloadDigest(payload),issuedAt,expiresAt:issuedAt+ttlMs,status:'pending'};
   check(principal,'request',record);
   return transaction(state=>{state.records.push(record);return {write:true,state,result:{...record}}});
  },
  decide({principal,approvalId,approve,reason}){
   if(typeof approve!=='boolean'||typeof reason!=='string'||!reason.trim()||reason.length>1000)throw Error('Explicit decision and reason required');
   return transaction(state=>{
    const record=state.records.find(r=>r.id===approvalId);if(!record)throw Error('Approval not found');
    check(principal,'approve',record);
    if(record.requesterId===principal.id)throw Error('Self approval prohibited');
    if(record.status!=='pending'||instant()>=record.expiresAt)throw Error('Approval unavailable or expired');
    Object.assign(record,{status:approve?'approved':'rejected',approverId:principal.id,reason,decidedAt:instant()});
    return {write:true,state,result:{...record}};
   });
  },
  cancel({principal,approvalId,reason}){
   if(typeof reason!=='string'||!reason.trim()||reason.length>1000)throw Error('Cancellation reason required');
   return transaction(state=>{
    const record=state.records.find(r=>r.id===approvalId);if(!record)throw Error('Approval not found');
    check(principal,'cancel',record);
    if(!['pending','approved'].includes(record.status))throw Error('Approval cannot be cancelled');
    Object.assign(record,{status:'cancelled',cancelledBy:principal.id,cancellationReason:reason,cancelledAt:instant()});
    return {write:true,state,result:{...record}};
   });
  },
  claim({principal,approvalId,action,projectId,resourceId,dataVersion,toolVersion,payload,idempotencyKey}){
   if(typeof idempotencyKey!=='string'||!ID.test(idempotencyKey))throw Error('Idempotency key required');
   const hash=payloadDigest(payload);
   return transaction(state=>{
    const record=state.records.find(r=>r.id===approvalId);if(!record)throw Error('Approval not found');
    check(principal,'execute',record);
    // Current policy must authorize the original approver as well as the executor.
    if(!record.approverId||authorize({id:record.approverId,orgId:record.orgId},'revalidate-approver',{...record})!==true)throw Error('Approver permission revoked');
    if(record.status!=='approved'||instant()>=record.expiresAt)throw Error('Approval unavailable or expired');
    if(record.action!==action||record.projectId!==projectId||record.resourceId!==resourceId||record.dataVersion!==dataVersion||record.toolVersion!==toolVersion||record.payloadDigest!==hash)throw Error('Approval binding changed');
    if(state.records.some(r=>r.orgId===record.orgId&&r.idempotencyKey===idempotencyKey))throw Error('Execution key already used');
    Object.assign(record,{status:'executing',executorId:principal.id,idempotencyKey,claimedAt:instant()});
    return {write:true,state,result:{...record}};
   });
  },
  finish({principal,approvalId,outcome}){
   if(!['succeeded','failed','unknown'].includes(outcome))throw Error('Invalid execution outcome');
   return transaction(state=>{
    const record=state.records.find(r=>r.id===approvalId);if(!record)throw Error('Approval not found');
    check(principal,'execute',record);
    if(record.status!=='executing'||record.executorId!==principal.id)throw Error('Execution not owned');
    Object.assign(record,{status:outcome,finishedAt:instant()});
    return {write:true,state,result:{...record}};
   });
  }
 });
}
module.exports={createApprovalStore,payloadDigest};
