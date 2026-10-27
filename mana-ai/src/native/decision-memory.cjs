'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {canAccessProject}=require('../security.cjs');
const {createEncryptedState}=require('../encrypted-state.cjs');
const ID=/^[A-Za-z0-9_-]{1,100}$/;
const STATES=new Set(['PLAN_PROPOSED','DECISION_PROPOSED','TIED_REQUIRES_REVIEW','NO_ADMISSIBLE_OPTION','NO_PLAN_WITHIN_CONSTRAINTS','SEARCH_LIMIT_REACHED','EVIDENCE_CONFLICT']);
function createDecisionMemory({directory,key,maxRecords=100}={}){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||!Buffer.isBuffer(key)||key.length!==32||!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>1000)throw Error('Invalid decision memory configuration');
 const secret=Buffer.from(key);
 function scoped(principal,project,permission){
  if(!principal||![principal.id,principal.orgId,project?.id].every(v=>typeof v==='string'&&ID.test(v))||!canAccessProject(principal,project)||!Array.isArray(principal.capabilityIds)||!principal.capabilityIds.includes(permission))throw Error('Decision memory access denied');
  const scope=JSON.stringify([principal.orgId,project.id,principal.id]);
  const file=path.join(directory,createHash('sha256').update(scope).digest('hex')+'.enc');
  return {scope,file};
 }
 function stateFor(state){if(state===null)return {version:1,records:[]};if(state.version!==1||!Array.isArray(state.records))throw Error('Invalid decision memory');return state}
 return Object.freeze({
  remember({principal,project,decision,consent=false}){
   const {scope,file}=scoped(principal,project,'native.memory.write');
   if(consent!==true)throw Error('Explicit decision memory consent required');
   if(!decision||decision.engine!=='MANA_NATIVE_SYMBOLIC_CORE'||decision.organizationId!==principal.orgId||decision.projectId!==project.id||decision.actionsExecuted!==0||!STATES.has(decision.status))throw Error('Only scoped native proposals may be remembered');
   const serialized=JSON.stringify(decision);
   if(Buffer.byteLength(serialized)>128*1024)throw Error('Decision record too large');
   const snapshot=JSON.parse(serialized),digest=createHash('sha256').update(serialized).digest('hex');
   if(!snapshot||snapshot.engine!=='MANA_NATIVE_SYMBOLIC_CORE'||snapshot.organizationId!==principal.orgId||snapshot.projectId!==project.id||snapshot.actionsExecuted!==0||!STATES.has(snapshot.status))throw Error('Invalid serialized proposal');
   fs.mkdirSync(directory,{recursive:true,mode:0o700});
   return createEncryptedState({file,key:secret,kind:'MANA_DECISION_MEMORY_V1:'+scope}).transact(raw=>{
    const state=stateFor(raw);
    if(state.records.some(r=>r.digest===digest))return {result:{digest,stored:false}};
    const recordedAt=new Date().toISOString();
    state.records.push({digest,decision:snapshot,recordedAt,consent:{granted:true,actorId:principal.id,recordedAt}});
    state.records=state.records.slice(-maxRecords);
    return {write:true,state,result:{digest,stored:true}};
   });
  },
  recall({principal,project}){
   const {scope,file}=scoped(principal,project,'native.memory.read');
   if(!fs.existsSync(directory))return [];
   return createEncryptedState({file,key:secret,kind:'MANA_DECISION_MEMORY_V1:'+scope}).transact(raw=>({result:stateFor(raw).records}));
  },
  forget({principal,project}){
   const {scope,file}=scoped(principal,project,'native.memory.delete');
   if(!fs.existsSync(directory))return {removed:0};
   return createEncryptedState({file,key:secret,kind:'MANA_DECISION_MEMORY_V1:'+scope}).transact(raw=>{
    const state=stateFor(raw),removed=state.records.length;
    return {write:true,state:{version:1,records:[]},result:{removed}};
   });
  }
 });
}
module.exports={createDecisionMemory};
