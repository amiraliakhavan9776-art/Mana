'use strict';
const {canAccessProject}=require('../security.cjs');
const {payloadDigest}=require('../approval-store.cjs');
const {decimal,zero,add,sub,mul,cmp,round,format}=require('../financial/exact-decimal.cjs');
const POLICY='work_accrual_fixed_upfront_expenses_before_funding';
function createRecoveryCashflow({planner,budgeting,authorize,verifyFunding}={}){
 if(!planner||typeof planner.propose!=='function'||!budgeting||typeof budgeting.compare!=='function'||typeof authorize!=='function'||typeof verifyFunding!=='function')throw Error('Trusted cashflow planning host required');
 return Object.freeze({analyze({principal,project,input,scenario,rateCard,budget,timeUnit,openingCash,funding,allocationPolicy}){
  if(!canAccessProject(principal,project)||!principal.capabilityIds?.includes('native.recovery.cashflow')||authorize(principal,'recovery.cashflow',project)!==true)throw Error('Recovery cashflow access denied');
  const supplied={input,scenario,rateCard,budget,timeUnit,openingCash,funding,allocationPolicy};payloadDigest(supplied);const data=JSON.parse(JSON.stringify(supplied));
  if(data.allocationPolicy!==POLICY||!Array.isArray(data.funding)||data.funding.length>32||!data.openingCash||Object.keys(data.openingCash).sort().join(',')!=='amount,currency,sourceRef')throw Error('Explicit cash allocation policy and bounded funding required');
  const costReport=budgeting.compare({principal,project,input:data.input,scenarios:[data.scenario],rateCard:data.rateCard,budget:data.budget,timeUnit:data.timeUnit});
  if(costReport.status!=='BUDGET_SCENARIOS_COMPARED')throw Error('Current feasible costed schedule required');
  const costed=costReport.scenarios[0];if(costed.status!=='COSTED_DRAFT')throw Error('Current feasible costed schedule required');
  const proposal=planner.propose({...data.input,principal,project,remainingEstimates:data.scenario.remainingEstimates,capacities:data.scenario.capacities});
  if(proposal.status!=='RECOVERY_SCHEDULE_PROPOSED'||payloadDigest(proposal)!==costed.proposalDigest)throw Error('Schedule evidence changed before cashflow allocation');
  const rounding=data.rateCard.rounding,money=x=>round(x,rounding),text=x=>format(money(x)),currency=costReport.currency;
  const ref=value=>typeof value==='string'&&value.trim()&&value.length<=200&&!/[\r\n]/.test(value);
  function amount(row){if(row.currency!==currency||!ref(row.sourceRef))throw Error('Matching cash currency and evidence reference required');const value=decimal(row.amount);if(cmp(value,money(value))!==0)throw Error('Funding must be exact at the accounting currency scale');return money(value);}
  const opening=amount(data.openingCash),ids=new Set(),references=new Set([data.openingCash.sourceRef.trim()]);
  for(const row of data.funding){if(!row||Object.keys(row).sort().join(',')!=='amount,at,currency,id,sourceRef'||typeof row.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(row.id)||ids.has(row.id)||!Number.isSafeInteger(row.at)||row.at<proposal.asOf||row.at>proposal.makespan)throw Error('Invalid, duplicate or out-of-window funding');ids.add(row.id);amount(row);if(references.has(row.sourceRef.trim()))throw Error('Duplicate cash evidence reference');references.add(row.sourceRef.trim());}
  const costDigest=payloadDigest(costReport),fundingPayload={organizationId:project.orgId,projectId:project.id,proposalDigest:costed.proposalDigest,costDigest,currency,timeUnit:data.timeUnit,openingCash:data.openingCash,funding:data.funding,allocationPolicy:POLICY},fundingDigest=payloadDigest(fundingPayload);
  if(verifyFunding({proposal:JSON.parse(JSON.stringify(fundingPayload)),digest:fundingDigest,principal,project})!==true)throw Error('Current scoped cash and funding not verified');
  const boundaries=[...new Set([proposal.asOf,proposal.makespan,...proposal.tasks.flatMap(t=>[t.start,t.finish]),...data.funding.map(f=>f.at)])].sort((a,b)=>a-b);if(boundaries.length>128)throw Error('Cashflow event bound exceeded');
  const resources=Object.keys(data.rateCard.resourceRates);
  function cumulativeCost(at){
   const parts=resources.map(id=>{const effort=proposal.tasks.reduce((sum,t)=>sum+Math.max(0,Math.min(at,t.finish)-t.start)*(Object.hasOwn(t.resources,id)?t.resources[id]:0),0);return mul(decimal(String(effort)),decimal(data.rateCard.resourceRates[id]));});
   parts.push(mul(decimal(String(at-proposal.asOf)),decimal(data.rateCard.overheadRate)),decimal(data.rateCard.fixedCosts[data.scenario.id]));
   return money(parts.reduce((sum,v)=>add(sum,rounding.lineRounding==='per_line'?money(v):v),zero()));
  }
  if(text(cumulativeCost(proposal.makespan))!==costed.estimatedTotal)throw Error('Cashflow allocation does not reconcile with reviewed cost total');
  let received=zero(),previous=zero(),minimum=opening,firstShortfall=null;const events=[];
  for(const at of boundaries){
   const spent=cumulativeCost(at),before=sub(add(opening,received),spent),incoming=data.funding.filter(f=>f.at===at).reduce((sum,f)=>add(sum,amount(f)),zero());
   if(cmp(before,minimum)<0)minimum=before;if(firstShortfall===null&&cmp(before,zero())<0)firstShortfall=at;received=add(received,incoming);
   events.push({at,spendingSincePrevious:text(sub(spent,previous)),cumulativeSpending:text(spent),cashBeforeFunding:text(before),fundingReceived:text(incoming),cashAfterFunding:text(add(before,incoming))});previous=spent;
  }
  return {schema:'MANA_RECOVERY_CASHFLOW_V1',status:firstShortfall===null?'NO_SHORTFALL_IN_MODEL':'MODELED_CASH_SHORTFALL',organizationId:project.orgId,projectId:project.id,scenarioId:data.scenario.id,proposalDigest:costed.proposalDigest,costDigest,fundingDigest,currency,timeUnit:data.timeUnit,allocationPolicy:POLICY,budgetWithinCeiling:costed.withinBudget,estimatedTotal:costed.estimatedTotal,openingCash:text(opening),totalFunding:text(received),minimumCash:text(minimum),modeledFundingGap:text(cmp(minimum,zero())<0?sub(zero(),minimum):zero()),firstDetectedShortfallAt:firstShortfall,closingCash:events.at(-1).cashAfterFunding,events,requiresApprovalTaskIds:costed.requiresApprovalTaskIds,requiresProfessionalSignoffTaskIds:costed.requiresProfessionalSignoffTaskIds,actionsExecuted:0,approved:false,baselineChanged:false,productionDeploymentAllowed:false,limitation:'Conditional work-accrual cash model with fixed upfront charges and expenses before same-time funding. Not an actual bank balance, vendor payment schedule, borrowing authorization or guarantee of receipts.'};
 }});
}
module.exports={createRecoveryCashflow};
