'use strict';
const {canAccessProject}=require('../security.cjs');
const {payloadDigest}=require('../approval-store.cjs');
// No model can consent, approve itself, or infer ownership of a business record.
function createTrainingFeedbackExporter({authorize,verifyReview}){
 if(typeof authorize!=='function'||typeof verifyReview!=='function')throw Error('Host consent/review verification required');
 return Object.freeze({export({principal,project,records}){
  if(!canAccessProject(principal,project)||!principal.capabilityIds?.includes('native.training.export')||authorize(principal,'training.export',project)!==true)throw Error('Training export denied');
  if(!Array.isArray(records)||!records.length||records.length>1000)throw Error('Feedback batch bound');
  const ids=new Set(),rows=[],provenance=[],codeGroups=new Map();
  for(const record of records){
   if(!record||Object.keys(record).sort().join(',')!=='code,consentId,group,id,organizationId,privacyReviewId,projectId,request,requesterId,reviewId,reviewerId,rightsRef')throw Error('Invalid feedback contract');
   for(const key of ['id','group','consentId','privacyReviewId','reviewId','rightsRef','requesterId','reviewerId'])if(typeof record[key]!=='string'||!record[key].trim()||record[key].length>(['id','group'].includes(key)?100:200))throw Error('Feedback provenance required');
   if(record.organizationId!==project.orgId||record.projectId!==project.id||record.requesterId===record.reviewerId||ids.has(record.id)||typeof record.request!=='string'||!record.request.trim()||record.request.length>4000||typeof record.code!=='string'||!record.code.trim()||record.code.length>8000)throw Error('Feedback scope/review/content denied');
   ids.add(record.id);const digest=payloadDigest(record);
   // Callback verifies exact payload, current consent, rights, privacy clearance and
   // reviewer authority in host records. IDs or caller booleans alone are insufficient.
   if(verifyReview({record:JSON.parse(JSON.stringify(record)),digest,principal,project})!==true)throw Error('Current consent/review not verified');
   const codeDigest=payloadDigest(record.code.trim());if(codeGroups.has(codeDigest)&&codeGroups.get(codeDigest)!==record.group)throw Error('Cross-group answer duplicate');codeGroups.set(codeDigest,record.group);
   rows.push({id:record.id,group:record.group,request:record.request,code:record.code,source:'reviewed-feedback:'+digest,training_allowed:true});
   provenance.push({id:record.id,digest,consentId:record.consentId,reviewId:record.reviewId,privacyReviewId:record.privacyReviewId,rightsRef:record.rightsRef});
  }
  const jsonl=rows.map(row=>JSON.stringify(row)).join('\n')+'\n';if(Buffer.byteLength(jsonl)>16000000)throw Error('Dataset export bound');
  return {schema:'MANA_REVIEWED_TRAINING_EXPORT_V1',organizationId:project.orgId,projectId:project.id,count:rows.length,jsonl,provenance,exportDigest:payloadDigest(rows),trained:false,productionDeploymentAllowed:false};
 }});
}
module.exports={createTrainingFeedbackExporter};
