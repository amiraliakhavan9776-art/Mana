'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createScenarioBudget}=require('../src/native/scenario-budget.cjs');
const {createRecoveryScenarioComparator}=require('../src/native/recovery-scenarios.cjs');
const {createProjectRecoveryPlanner}=require('../src/native/project-recovery.cjs');
const {createProjectMonitor}=require('../src/native/project-monitor.cjs');
const {scheduleProject}=require('../src/native/resource-scheduler.cjs');
const {createAuditedNativeServices}=require('../src/native/audited-services.cjs');
function setup(){
 const project={id:'p',orgId:'org'},principal={id:'u',orgId:'org',role:'analyst',projectIds:['p'],capabilityIds:['native.schedule.propose','native.project.monitor','native.project.replan','native.recovery.scenarios','native.recovery.budget']};
 const tasks=[{id:'designA',duration:4,dependsOn:[],resources:{team:1}},{id:'designB',duration:4,dependsOn:[],resources:{team:1}},{id:'review',duration:1,dependsOn:['designA','designB'],resources:{}}],schedule=scheduleProject({principal,project,tasks,capacities:{team:1}});schedule.tasks.find(t=>t.id==='review').requiresApproval=true;
 const input={schedule,observations:tasks.map(t=>({taskId:t.id,organizationId:'org',projectId:'p',progressBps:0,observedAt:1,evidenceRef:'receipt-'+t.id})),weights:{designA:1,designB:1,review:1},asOf:1,horizon:30};
 const monitor=createProjectMonitor({authorize:()=>true,verifyBaseline:()=>true,verifyObservation:()=>true}),planner=createProjectRecoveryPlanner({monitor,authorize:()=>true,verifyEstimates:()=>true}),comparator=createRecoveryScenarioComparator({planner,authorize:()=>true});let current=true;
 const budgeter=createScenarioBudget({comparator,authorize:()=>true,verifyRates:()=>current});
 const scenarios=['base','fast'].map(id=>({id,capacities:{team:id==='base'?1:2},remainingEstimates:Object.fromEntries(tasks.map(t=>[t.id,{duration:t.duration,resources:t.resources}]))}));
 const request={principal,project,input,scenarios,timeUnit:'day',rateCard:{currency:'IRT',timeUnit:'day',policyRef:'reviewed-rate-card',rounding:{scale:2,mode:'half_up',lineRounding:'invoice'},resourceRates:{team:'10.10'},overheadRate:'1.25',fixedCosts:{base:'0',fast:'12.50'}},budget:{currency:'IRT',amount:'95'}};
 return {budgeter,request,revoke:()=>{current=false;}};
}
test('actual recovery comparison separates cheapest and fastest affordable options with exact currency normalization',async()=>{
 const {budgeter,request}=setup(),before=JSON.stringify(request),report=budgeter.compare(request),base=report.scenarios.find(r=>r.id==='base'),fast=report.scenarios.find(r=>r.id==='fast');
 assert.equal(report.status,'BUDGET_SCENARIOS_COMPARED');assert.equal(base.estimatedTotal,'92.05');assert.equal(base.normalizedIRR,'920.50');assert.equal(fast.estimatedTotal,'99.55');assert.equal(fast.budgetVariance,'4.55');assert.equal(fast.withinBudget,false);assert.deepEqual(report.cheapestScenarioIds,['base']);assert.deepEqual(report.earliestWithinBudgetScenarioIds,['base']);assert.deepEqual(report.costTimeNonDominatedScenarioIds,['base','fast']);assert.deepEqual(fast.requiresApprovalTaskIds,['review']);assert.equal(report.actionsExecuted,0);assert.equal(JSON.stringify(request),before);
 const events=[],noop=()=>({unused:true}),api=createAuditedNativeServices({experience:{remember:noop,recall:noop,forget:noop},recovery:{propose:noop},budgeting:budgeter,audit:{record:e=>events.push(e)}});assert.deepEqual(await api.budgeting.compare(request),report);assert.deepEqual(events.map(e=>e.outcome),['intent','completed']);
 const path=require('node:path'),{spawnSync}=require('node:child_process'),run=spawnSync(process.execPath,[path.join(__dirname,'../budget-project.cjs'),path.join(__dirname,'../examples/project-budget.json')],{encoding:'utf8',timeout:10000});assert.equal(run.status,0,run.stderr);const local=JSON.parse(run.stdout);assert.equal(local.scenarios[0].estimatedTotal,'92.05');assert.match(local.evidenceAuthority,/local operator/);
});
test('resource costing retains decimal precision above JavaScript safe integer money values',()=>{
 const {budgeter,request}=setup();request.rateCard.resourceRates.team='9007199254740993.01';request.rateCard.overheadRate='0';request.rateCard.fixedCosts={base:'0',fast:'0'};request.budget.amount='100000000000000000';
 const report=budgeter.compare(request);assert.equal(report.scenarios[0].estimatedTotal,'72057594037927944.08');assert.deepEqual(report.cheapestScenarioIds,['base','fast']);assert.deepEqual(report.costTimeNonDominatedScenarioIds,['fast']);
});
test('explicit line rounding differs from invoice rounding and half-even ties remain exact',()=>{
 const {budgeter,request}=setup();request.rateCard.resourceRates.team='0.00125';request.rateCard.overheadRate='0.005';request.rateCard.fixedCosts={base:'0.005',fast:'0.005'};
 const invoice=budgeter.compare(request);assert.equal(invoice.scenarios[0].estimatedTotal,'0.06');
 request.rateCard.rounding.lineRounding='per_line';assert.equal(budgeter.compare(request).scenarios[0].estimatedTotal,'0.07');request.rateCard.rounding.mode='half_even';assert.equal(budgeter.compare(request).scenarios[0].estimatedTotal,'0.05');
});
test('missing rates, mixed currencies, time-unit mismatch, denied scope and revoked authority refuse costing',()=>{
 const {budgeter,request,revoke}=setup();assert.throws(()=>budgeter.compare({...request,budget:{currency:'IRR',amount:'95'}}),/currency/);assert.throws(()=>budgeter.compare({...request,timeUnit:'hour'}),/time unit/);assert.throws(()=>budgeter.compare({...request,rateCard:{...request.rateCard,resourceRates:{}}}),/every consumed/);
 assert.throws(()=>budgeter.compare({...request,rateCard:{...request.rateCard,resourceRates:{team:10}}}),/decimal string/);assert.throws(()=>budgeter.compare({...request,principal:{...request.principal,capabilityIds:[]}}),/denied/);assert.throws(()=>budgeter.compare({...request,project:{id:'foreign',orgId:'org'}}),/denied/);revoke();assert.throws(()=>budgeter.compare(request),/verified/);
});
test('infeasible scenarios are not priced and incomplete evidence yields no false affordable option',()=>{
 const {budgeter,request}=setup();const partial=budgeter.compare({...request,input:{...request.input,horizon:8}});assert.equal(partial.scenarios[0].status,'NO_SCHEDULE_WITHIN_HORIZON');assert.equal(partial.scenarios[0].estimatedTotal,undefined);assert.deepEqual(partial.withinBudgetScenarioIds,[]);
 const blocked=budgeter.compare({...request,input:{...request.input,observations:[]}});assert.equal(blocked.status,'EVIDENCE_RECONCILIATION_REQUIRED');assert.deepEqual(blocked.scenarios,[]);assert.deepEqual(blocked.cheapestScenarioIds,[]);
});
