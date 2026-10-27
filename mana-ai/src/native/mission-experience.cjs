'use strict';
const {createEncryptedState}=require('../encrypted-state.cjs');
const {canAccessProject}=require('../security.cjs');
const {payloadDigest}=require('../approval-store.cjs');
// Reviewed execution metadata only. Recalling an experience never authorizes replay.
function createMissionExperience({file,key,runtime,authorize,verifyConsent,maxRecords=100}={}){
 if(!runtime||typeof runtime.get!=='function'||typeof authorize!=='function'||typeof verifyConsent!=='function'||!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>1000)throw Error('Trusted mission experience host required');
 const store=createEncryptedState({file,key,kind:'MANA_MISSION_EXPERIENCE_V1'});
 function check(principal,project,operation){if(!canAccessProject(principal,project)||!principal.capabilityIds?.includes('native.experience.'+operation)||authorize(principal,'experience.'+operation,project)!==true)throw Error('Experience access denied');}
 function state(raw){if(raw===null)return {version:1,records:[]};if(raw.version!==1||!Array.isArray(raw.records))throw Error('Invalid experience state');return raw;}
 function consent(record,principal,project){return verifyConsent({record:JSON.parse(JSON.stringify(record)),digest:payloadDigest(record),principal,project})===true;}
 return Object.freeze({
  remember({principal,project,missionId,consentId}){
   check(principal,project,'write');if(typeof consentId!=='string'||!consentId.trim()||consentId.length>200)throw Error('Explicit consent reference required');
   const mission=runtime.get({principal,project,missionId});
   if(mission.orgId!==project.orgId||mission.projectId!==project.id||mission.status!=='completed'||mission.cancelRequested||!mission.tasks.length||mission.tasks.some(t=>!['succeeded','superseded'].includes(t.status)))throw Error('Only completed scoped missions may be remembered');
   const tasks=mission.tasks.filter(t=>t.status==='succeeded').map(t=>({taskId:t.taskId,capabilityId:t.capabilityId,toolFingerprint:t.toolFingerprint,resultDigest:t.resultDigest,attempts:t.attempts.length}));
   if(!tasks.length||tasks.some(t=>!Number.isInteger(t.attempts)||t.attempts<1||!['toolFingerprint','resultDigest'].every(k=>typeof t[k]==='string'&&/^[a-f0-9]{64}$/.test(t[k]))))throw Error('Verified execution receipts required');
   const record={organizationId:project.orgId,projectId:project.id,actorId:principal.id,missionId:mission.id,missionVersion:mission.version,planningMode:mission.planningMode??'symbolic',tasks,consentId};
   if(!consent(record,principal,project))throw Error('Current experience consent not verified');
   const digest=payloadDigest(record);return store.transact(raw=>{const s=state(raw);if(s.records.some(r=>r.digest===digest))return {result:{stored:false,digest}};if(s.records.length>=maxRecords)throw Error('Experience capacity reached');s.records.push({digest,record});return {write:true,state:s,result:{stored:true,digest,trained:false}};});
  },
  recall({principal,project}){
   check(principal,project,'read');return store.transact(raw=>({result:state(raw).records.filter(({record})=>record.organizationId===project.orgId&&record.projectId===project.id&&record.actorId===principal.id&&consent(record,principal,project)).map(({digest,record})=>({digest,...JSON.parse(JSON.stringify(record)),advisoryOnly:true,executionAuthorized:false,trained:false}))}));
  },
  forget({principal,project}){
   check(principal,project,'delete');return store.transact(raw=>{const s=state(raw),kept=s.records.filter(({record})=>record.organizationId!==project.orgId||record.projectId!==project.id||record.actorId!==principal.id);return {write:true,state:{version:1,records:kept},result:{removed:s.records.length-kept.length}};});
  }
 });
}
module.exports={createMissionExperience};
