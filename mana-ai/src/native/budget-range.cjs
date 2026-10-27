'use strict';
const {canAccessProject}=require('../security.cjs');
const {payloadDigest}=require('../approval-store.cjs');
const {decimal,cmp}=require('../financial/exact-decimal.cjs');
function createBudgetRange({budgeting,authorize,verifyBounds}={}){
 if(!budgeting||typeof budgeting.compare!=='function'||typeof authorize!=='function'||typeof verifyBounds!=='function')throw Error('Trusted budget range host required');
 return Object.freeze({analyze({principal,project,input,scenarios,lowerRateCard,upperRateCard,budget,timeUnit}){
  if(!canAccessProject(principal,project)||!principal.capabilityIds?.includes('native.recovery.budget.range')||authorize(principal,'recovery.budget.range',project)!==true)throw Error('Budget range access denied');
  const supplied={input,scenarios,lowerRateCard,upperRateCard,budget,timeUnit};payloadDigest(supplied);const snapshot=JSON.parse(JSON.stringify(supplied)),lo=snapshot.lowerRateCard,hi=snapshot.upperRateCard;
  if(!lo||!hi||lo.currency!==hi.currency||lo.timeUnit!==hi.timeUnit||payloadDigest(lo.rounding)!==payloadDigest(hi.rounding))throw Error('Range endpoints need matching currency, units and rounding');
  const increasing=(a,b)=>cmp(decimal(a),decimal(b))<=0;
  if(!increasing(lo.overheadRate,hi.overheadRate))throw Error('Inverted overhead range');
  for(const name of ['resourceRates','fixedCosts']){
   if(!lo[name]||!hi[name]||Object.getPrototypeOf(lo[name])!==Object.prototype||Object.getPrototypeOf(hi[name])!==Object.prototype||Object.keys(lo[name]).sort().join(',')!==Object.keys(hi[name]).sort().join(','))throw Error('Range endpoints need matching rate identifiers');
   for(const id of Object.keys(lo[name]))if(!increasing(lo[name][id],hi[name][id]))throw Error('Inverted rate range');
  }
  const boundPayload={sourceDigest:payloadDigest(snapshot.input),scenarioDigests:snapshot.scenarios.map(s=>({id:s.id,digest:payloadDigest(s)})),lowerRateCard:lo,upperRateCard:hi,budget:snapshot.budget,timeUnit:snapshot.timeUnit},boundsDigest=payloadDigest(boundPayload);
  if(verifyBounds({proposal:JSON.parse(JSON.stringify(boundPayload)),digest:boundsDigest,principal,project})!==true)throw Error('Current scoped uncertainty bounds not verified');
  const common={principal,project,input:snapshot.input,scenarios:snapshot.scenarios,budget:snapshot.budget,timeUnit:snapshot.timeUnit},lower=budgeting.compare({...common,rateCard:lo}),upper=budgeting.compare({...common,rateCard:hi});
  if(lower.comparisonDigest!==upper.comparisonDigest||lower.status!==upper.status)throw Error('Scenario evidence changed between range endpoints');
  const base={schema:'MANA_BUDGET_RANGE_V1',organizationId:project.orgId,projectId:project.id,boundsDigest,comparisonDigest:lower.comparisonDigest,lowerRateDigest:lower.rateDigest,upperRateDigest:upper.rateDigest,currency:lower.currency,timeUnit:snapshot.timeUnit,budgetAmount:lower.budgetAmount,actionsExecuted:0,approved:false,baselineChanged:false,productionDeploymentAllowed:false};
  if(lower.status!=='BUDGET_SCENARIOS_COMPARED')return {...base,status:lower.status,scenarios:[],withinAllModeledRatesScenarioIds:[],rateSensitiveScenarioIds:[],overBudgetAtLowerRatesScenarioIds:[]};
  if(lower.scenarios.length!==upper.scenarios.length)throw Error('Range scenario coverage changed');
  const rows=lower.scenarios.map(a=>{
   const b=upper.scenarios.find(r=>r.id===a.id);if(!b||a.status!==b.status)throw Error('Range scenario status changed');
   if(a.status!=='COSTED_DRAFT')return {id:a.id,status:a.status};
   if(a.proposalDigest!==b.proposalDigest||a.makespan!==b.makespan||(b.withinBudget&&!a.withinBudget))throw Error('Inconsistent range endpoints');
   return {id:a.id,status:b.withinBudget?'WITHIN_ALL_MODELED_RATES':a.withinBudget?'RATE_SENSITIVE':'OVER_BUDGET_AT_LOWER_RATES',makespan:a.makespan,proposalDigest:a.proposalDigest,minimumEstimatedCost:a.estimatedTotal,maximumEstimatedCost:b.estimatedTotal,maximumBudgetVariance:b.budgetVariance,normalizedIRR:{minimum:a.normalizedIRR,maximum:b.normalizedIRR},requiresApprovalTaskIds:a.requiresApprovalTaskIds,requiresProfessionalSignoffTaskIds:a.requiresProfessionalSignoffTaskIds};
  });
  const within=rows.filter(r=>r.status==='WITHIN_ALL_MODELED_RATES'),earliest=within.length?Math.min(...within.map(r=>r.makespan)):null;
  return {...base,status:'BUDGET_RANGE_ANALYZED',scenarios:rows,withinAllModeledRatesScenarioIds:within.map(r=>r.id).sort(),rateSensitiveScenarioIds:rows.filter(r=>r.status==='RATE_SENSITIVE').map(r=>r.id).sort(),overBudgetAtLowerRatesScenarioIds:rows.filter(r=>r.status==='OVER_BUDGET_AT_LOWER_RATES').map(r=>r.id).sort(),earliestWithinAllModeledRatesScenarioIds:within.filter(r=>r.makespan===earliest).map(r=>r.id).sort(),method:'Fixed schedules and nonnegative bounded rates only. All-low/all-high endpoint costing bounds this model because each component and explicit rounding are monotone. No probabilities, duration uncertainty, market forecast or guarantee beyond supplied bounds.'};
 }});
}
module.exports={createBudgetRange};
