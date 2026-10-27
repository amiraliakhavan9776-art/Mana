'use strict';
const {canAccessProject}=require('../security.cjs');
const {payloadDigest}=require('../approval-store.cjs');
const {decimal,zero,add,sub,mul,cmp,round,format}=require('../financial/exact-decimal.cjs');
function fields(value,names){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!==[...names].sort().join(','))throw Error('Explicit budget contract required');}
function createScenarioBudget({comparator,authorize,verifyRates}={}){
 if(!comparator||typeof comparator.compare!=='function'||typeof authorize!=='function'||typeof verifyRates!=='function')throw Error('Trusted scenario budget host required');
 return Object.freeze({compare({principal,project,input,scenarios,rateCard,budget,timeUnit}){
  if(!canAccessProject(principal,project)||!principal.capabilityIds?.includes('native.recovery.budget')||authorize(principal,'recovery.budget',project)!==true)throw Error('Scenario budget access denied');
  payloadDigest({rateCard,budget,timeUnit});const rates=JSON.parse(JSON.stringify(rateCard)),ceiling=JSON.parse(JSON.stringify(budget));
  fields(rates,['currency','timeUnit','policyRef','rounding','resourceRates','fixedCosts','overheadRate']);fields(ceiling,['currency','amount']);fields(rates.rounding,['scale','mode','lineRounding']);
  if(!['IRR','IRT'].includes(rates.currency)||ceiling.currency!==rates.currency||typeof timeUnit!=='string'||!timeUnit.trim()||timeUnit.length>40||/[\r\n]/.test(timeUnit)||rates.timeUnit!==timeUnit||typeof rates.policyRef!=='string'||!rates.policyRef.trim()||rates.policyRef.length>200)throw Error('Explicit matching currency, time unit and rate source required');
  const rounding=rates.rounding;if(!Number.isInteger(rounding.scale)||rounding.scale<0||rounding.scale>6||!['half_up','half_even','toward_zero'].includes(rounding.mode)||!['per_line','invoice'].includes(rounding.lineRounding))throw Error('Explicit rounding policy required');
  if(!rates.resourceRates||Object.getPrototypeOf(rates.resourceRates)!==Object.prototype||Object.keys(rates.resourceRates).length>16||!rates.fixedCosts||Object.getPrototypeOf(rates.fixedCosts)!==Object.prototype)throw Error('Explicit bounded resource and scenario rates required');
  for(const [id,rate] of Object.entries(rates.resourceRates)){if(!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(id))throw Error('Invalid resource rate identifier');decimal(rate);}
  const limit=decimal(ceiling.amount),overheadRate=decimal(rates.overheadRate);
  const comparison=comparator.compare({principal,project,input,scenarios}),comparisonDigest=payloadDigest(comparison);
  if(Object.keys(rates.fixedCosts).length!==scenarios.length||scenarios.some(s=>!Object.hasOwn(rates.fixedCosts,s.id)))throw Error('Explicit fixed cost for every scenario required');for(const amount of Object.values(rates.fixedCosts))decimal(amount);
  const ratePayload={comparisonDigest,rateCard:rates,budget:ceiling,timeUnit},rateDigest=payloadDigest(ratePayload);
  if(verifyRates({proposal:JSON.parse(JSON.stringify(ratePayload)),digest:rateDigest,principal,project})!==true)throw Error('Current scoped rates and budget not verified');
  const base={schema:'MANA_SCENARIO_BUDGET_V1',organizationId:project.orgId,projectId:project.id,comparisonDigest,rateDigest,currency:rates.currency,timeUnit,policyRef:rates.policyRef,budgetAmount:ceiling.amount,rounding,actionsExecuted:0,approved:false,baselineChanged:false,productionDeploymentAllowed:false};
  if(comparison.status!=='SCENARIOS_COMPARED')return {...base,status:comparison.status,scenarios:[],cheapestScenarioIds:[],withinBudgetScenarioIds:[]};
  const totals=new Map(),rows=comparison.scenarios.map(row=>{
   if(row.status!=='RECOVERY_SCHEDULE_PROPOSED')return {id:row.id,status:row.status};
   let exact=zero(),roundedLines=zero();const components={};
   const include=amount=>{exact=add(exact,amount);roundedLines=add(roundedLines,round(amount,rounding));return format(round(amount,rounding));};
   for(const [id,effort] of Object.entries(row.resourceEffort)){if(!Object.hasOwn(rates.resourceRates,id)||!Number.isSafeInteger(effort)||effort<0)throw Error('Verified rate for every consumed resource required');components[id]=include(mul(decimal(String(effort)),decimal(rates.resourceRates[id])));}
   const elapsed=row.makespan-input.asOf;if(!Number.isSafeInteger(elapsed)||elapsed<0)throw Error('Invalid recovery time basis');
   const overhead=include(mul(decimal(String(elapsed)),overheadRate)),fixed=include(decimal(rates.fixedCosts[row.id])),total=round(rounding.lineRounding==='per_line'?roundedLines:exact,rounding);totals.set(row.id,total);
   return {id:row.id,status:'COSTED_DRAFT',proposalDigest:row.proposalDigest,makespan:row.makespan,resourceCosts:components,overheadCost:overhead,fixedCost:fixed,exactUnroundedTotal:format(exact),estimatedTotal:format(total),budgetVariance:format(sub(total,limit)),withinBudget:cmp(total,limit)<=0,normalizedIRR:format(rates.currency==='IRT'?mul(total,decimal('10')):total),requiresApprovalTaskIds:row.requiresApprovalTaskIds,requiresProfessionalSignoffTaskIds:row.requiresProfessionalSignoffTaskIds};
  });
  const feasible=rows.filter(r=>r.status==='COSTED_DRAFT'),within=feasible.filter(r=>r.withinBudget),cheapest=feasible.reduce((best,r)=>best===null||cmp(totals.get(r.id),best)<0?totals.get(r.id):best,null),earliest=within.length?Math.min(...within.map(r=>r.makespan)):null;
  return {...base,status:'BUDGET_SCENARIOS_COMPARED',scenarios:rows,cheapestScenarioIds:feasible.filter(r=>cmp(totals.get(r.id),cheapest)===0).map(r=>r.id).sort(),withinBudgetScenarioIds:within.map(r=>r.id).sort(),earliestWithinBudgetScenarioIds:within.filter(r=>r.makespan===earliest).map(r=>r.id).sort(),costTimeNonDominatedScenarioIds:feasible.filter(r=>!feasible.some(other=>other.id!==r.id&&other.makespan<=r.makespan&&cmp(totals.get(other.id),totals.get(r.id))<=0&&(other.makespan<r.makespan||cmp(totals.get(other.id),totals.get(r.id))<0))).map(r=>r.id).sort(),limitation:'Draft remaining-work resource effort, elapsed overhead and explicit fixed charges only. No taxes, contract entitlements, penalties, payments, legal rates or actual profitability inferred; no automatic selection.'};
 }});
}
module.exports={createScenarioBudget};
