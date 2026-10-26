'use strict';
const {createProposalReview}=require('./proposal-review.cjs');
const {payloadDigest}=require('../approval-store.cjs');
function createCostReview({budgetRanges,approvals,authorize,now=Date.now}={}){
 if(!budgetRanges||typeof budgetRanges.analyze!=='function')throw Error('Trusted cost range service required');
 function buildProposal({principal,project,input}){
  if(!input||Object.keys(input).sort().join(',')!=='analysis,scenarioId'||typeof input.scenarioId!=='string'||!input.analysis)throw Error('Explicit scenario and cost analysis input required');
  const report=budgetRanges.analyze({...input.analysis,principal,project}),selected=report.scenarios.find(r=>r.id===input.scenarioId);
  if(report.status!=='BUDGET_RANGE_ANALYZED'||!selected||selected.status!=='WITHIN_ALL_MODELED_RATES')throw Error('Scenario must be within all reviewed rate bounds before cost review');
  return {schema:'MANA_COSTED_RECOVERY_PROPOSAL_V1',status:'COSTED_RECOVERY_REVIEW_PROPOSED',organizationId:project.orgId,projectId:project.id,baselineDigest:payloadDigest(input.analysis.input.schedule),scenarioId:input.scenarioId,analysisDigest:payloadDigest(report),comparisonDigest:report.comparisonDigest,boundsDigest:report.boundsDigest,lowerRateDigest:report.lowerRateDigest,upperRateDigest:report.upperRateDigest,currency:report.currency,timeUnit:report.timeUnit,budgetAmount:report.budgetAmount,selectedScenario:JSON.parse(JSON.stringify(selected)),actionsExecuted:0,approved:false,baselineChanged:false,productionDeploymentAllowed:false};
 }
 return createProposalReview({approvals,authorize,now,buildProposal,contract:{label:'Cost',permission:'recovery.cost.review',capability:'native.recovery.cost.review',action:'native.project.recovery.cost.review',proposalSchema:'MANA_COSTED_RECOVERY_PROPOSAL_V1',proposalStatus:'COSTED_RECOVERY_REVIEW_PROPOSED',requestSchema:'MANA_COST_REVIEW_V1',receiptSchema:'MANA_COST_REVIEW_RECEIPT_V1'}});
}
module.exports={createCostReview};
