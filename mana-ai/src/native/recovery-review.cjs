'use strict';
const {canAccessProject}=require('../security.cjs');
const {payloadDigest}=require('../approval-store.cjs');
const ACTION='native.project.recovery.review',VERSION='MANA_PROJECT_RECOVERY_V1';
function createRecoveryReview({planner,approvals,authorize,now=Date.now}={}){
 if(!planner||typeof planner.propose!=='function'||!approvals||!['request','inspect','decide'].every(k=>typeof approvals[k]==='function')||typeof authorize!=='function'||typeof now!=='function')throw Error('Trusted recovery review configuration required');
 function check(principal,project,operation){if(!canAccessProject(principal,project)||!principal.capabilityIds?.includes('native.recovery.review.'+operation)||authorize(principal,'recovery.review.'+operation,project)!==true)throw Error('Recovery review denied');}
 function read(principal,project,approvalId){const record=approvals.inspect({principal,approvalId});if(record.orgId!==project.orgId||record.projectId!==project.id||record.resourceId!==project.id||record.action!==ACTION||record.toolVersion!==VERSION)throw Error('Recovery review scope or type mismatch');return record;}
 function proposalFor(principal,project,input){const proposal=planner.propose({...input,principal,project});if(proposal.schema!==VERSION||proposal.status!=='RECOVERY_SCHEDULE_PROPOSED'||proposal.projectId!==project.id||proposal.organizationId!==project.orgId)throw Error('Reviewable recovery proposal required');return proposal;}
 function matches(record,proposal){return record.dataVersion===proposal.baselineDigest&&record.payloadDigest===payloadDigest(proposal);}
 function instant(){const value=now();if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid review clock');return value;}
 return Object.freeze({
  request({principal,project,input,ttlMs=300000}){
   check(principal,project,'request');const proposal=proposalFor(principal,project,input);
   const approval=approvals.request({principal,action:ACTION,projectId:project.id,resourceId:project.id,dataVersion:proposal.baselineDigest,toolVersion:VERSION,payload:proposal,ttlMs});
   return {schema:'MANA_RECOVERY_REVIEW_V1',approval,proposal,baselineChanged:false,productionDeploymentAllowed:false};
  },
  decide({principal,project,approvalId,approve,reason,input}){
   check(principal,project,'approve');const record=read(principal,project,approvalId);
   if(approve===true&&!matches(record,proposalFor(principal,project,input)))throw Error('Recovery proposal changed; new review required');
   return approvals.decide({principal,approvalId,approve,reason});
  },
  current({principal,project,approvalId,input}){
   check(principal,project,'read');const record=read(principal,project,approvalId),base={schema:'MANA_RECOVERY_REVIEW_RECEIPT_V1',approvalId,projectId:project.id,organizationId:project.orgId,baselineChanged:false,executionAuthorized:false,productionDeploymentAllowed:false};
   if(record.status!=='approved'||instant()>=record.expiresAt)return {...base,status:'REVIEW_NOT_CURRENT',reviewApproved:false};
   if(authorize({id:record.approverId,orgId:record.orgId},'recovery.review.revalidate-approver',{...project,approvalId,record:{...record}})!==true)return {...base,status:'REVIEW_AUTHORITY_REVOKED',reviewApproved:false};
   const proposal=proposalFor(principal,project,input);
   if(!matches(record,proposal))return {...base,status:'REVIEW_BINDING_CHANGED',reviewApproved:false};
   return {...base,status:'REVIEW_APPROVED_CURRENT',reviewApproved:true,proposalDigest:record.payloadDigest,baselineDigest:record.dataVersion,approverId:record.approverId,expiresAt:record.expiresAt};
  }
 });
}
module.exports={createRecoveryReview};
