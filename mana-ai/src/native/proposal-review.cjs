'use strict';
const {canAccessProject}=require('../security.cjs');
const {payloadDigest}=require('../approval-store.cjs');
// Shared review protocol. Contract and proposal builder are trusted host configuration.
function createProposalReview({buildProposal,approvals,authorize,now=Date.now,contract}={}){
 if(typeof buildProposal!=='function'||!approvals||!['request','inspect','decide'].every(k=>typeof approvals[k]==='function')||typeof authorize!=='function'||typeof now!=='function'||!contract)throw Error('Trusted proposal review configuration required');
 const c=Object.freeze({...contract});for(const key of ['label','permission','capability','action','proposalSchema','proposalStatus','requestSchema','receiptSchema'])if(typeof c[key]!=='string'||!c[key]||c[key].length>100||/[\r\n]/.test(c[key]))throw Error('Invalid trusted review contract');
 function check(principal,project,operation){if(!canAccessProject(principal,project)||!principal.capabilityIds?.includes(c.capability+'.'+operation)||authorize(principal,c.permission+'.'+operation,project)!==true)throw Error(c.label+' review denied');}
 function read(principal,project,approvalId){const record=approvals.inspect({principal,approvalId});if(record.orgId!==project.orgId||record.projectId!==project.id||record.resourceId!==project.id||record.action!==c.action||record.toolVersion!==c.proposalSchema)throw Error(c.label+' review scope or type mismatch');return record;}
 function proposalFor(principal,project,input){const proposal=buildProposal({principal,project,input});if(!proposal||proposal.schema!==c.proposalSchema||proposal.status!==c.proposalStatus||proposal.projectId!==project.id||proposal.organizationId!==project.orgId||typeof proposal.baselineDigest!=='string'||!/^[a-f0-9]{64}$/.test(proposal.baselineDigest))throw Error('Reviewable '+c.label.toLowerCase()+' proposal required');return proposal;}
 function matches(record,proposal){return record.dataVersion===proposal.baselineDigest&&record.payloadDigest===payloadDigest(proposal);}
 function instant(){const value=now();if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid review clock');return value;}
 return Object.freeze({
  request({principal,project,input,ttlMs=300000}){
   check(principal,project,'request');const proposal=proposalFor(principal,project,input);
   const approval=approvals.request({principal,action:c.action,projectId:project.id,resourceId:project.id,dataVersion:proposal.baselineDigest,toolVersion:c.proposalSchema,payload:proposal,ttlMs});
   return {schema:c.requestSchema,approval,proposal,baselineChanged:false,productionDeploymentAllowed:false};
  },
  decide({principal,project,approvalId,approve,reason,input}){
   check(principal,project,'approve');const record=read(principal,project,approvalId);
   if(approve===true&&!matches(record,proposalFor(principal,project,input)))throw Error(c.label+' proposal changed; new review required');
   return approvals.decide({principal,approvalId,approve,reason});
  },
  current({principal,project,approvalId,input}){
   check(principal,project,'read');const record=read(principal,project,approvalId),base={schema:c.receiptSchema,approvalId,projectId:project.id,organizationId:project.orgId,baselineChanged:false,executionAuthorized:false,productionDeploymentAllowed:false};
   if(record.status!=='approved'||instant()>=record.expiresAt)return {...base,status:'REVIEW_NOT_CURRENT',reviewApproved:false};
   if(authorize({id:record.approverId,orgId:record.orgId},c.permission+'.revalidate-approver',{...project,approvalId,record:{...record}})!==true)return {...base,status:'REVIEW_AUTHORITY_REVOKED',reviewApproved:false};
   const proposal=proposalFor(principal,project,input);
   if(!matches(record,proposal))return {...base,status:'REVIEW_BINDING_CHANGED',reviewApproved:false};
   return {...base,status:'REVIEW_APPROVED_CURRENT',reviewApproved:true,proposalDigest:record.payloadDigest,baselineDigest:record.dataVersion,approverId:record.approverId,expiresAt:record.expiresAt};
  }
 });
}
module.exports={createProposalReview};
