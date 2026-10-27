'use strict';
const {createProposalReview}=require('./proposal-review.cjs');
function createRecoveryReview({planner,approvals,authorize,now=Date.now}={}){
 if(!planner||typeof planner.propose!=='function')throw Error('Trusted recovery review configuration required');
 return createProposalReview({approvals,authorize,now,buildProposal:({principal,project,input})=>planner.propose({...input,principal,project}),contract:{label:'Recovery',permission:'recovery.review',capability:'native.recovery.review',action:'native.project.recovery.review',proposalSchema:'MANA_PROJECT_RECOVERY_V1',proposalStatus:'RECOVERY_SCHEDULE_PROPOSED',requestSchema:'MANA_RECOVERY_REVIEW_V1',receiptSchema:'MANA_RECOVERY_REVIEW_RECEIPT_V1'}});
}
module.exports={createRecoveryReview};
