'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {createBudgetRange}=require('../src/native/budget-range.cjs');
const {createScenarioBudget}=require('../src/native/scenario-budget.cjs');
const {createRecoveryScenarioComparator}=require('../src/native/recovery-scenarios.cjs');
const {createProjectRecoveryPlanner}=require('../src/native/project-recovery.cjs');
const {createProjectMonitor}=require('../src/native/project-monitor.cjs');
const {scheduleProject}=require('../src/native/resource-scheduler.cjs');
const {createAuditedNativeServices}=require('../src/native/audited-services.cjs');
function setup(){
 const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/project-budget-range.json'),'utf8'));
 const project={id:'local',orgId:'local'},principal={id:'u',orgId:'local',role:'analyst',projectIds:['local'],capabilityIds:['native.schedule.propose','native.project.monitor','native.project.replan','native.recovery.scenarios','native.recovery.budget','native.recovery.budget.range']};
 const schedule=scheduleProject({principal,project,tasks:data.tasks,capacities:data.capacities,horizon:data.horizon});schedule.tasks.find(t=>t.id==='review').requiresApproval=true;
 const input={schedule,observations:data.observations,weights:data.weights,asOf:data.asOf,horizon:data.horizon};let boundsCurrent=true,ratesCurrent=true;
 const monitor=createProjectMonitor({authorize:()=>true,verifyBaseline:()=>true,verifyObservation:()=>true}),planner=createProjectRecoveryPlanner({monitor,authorize:()=>true,verifyEstimates:()=>true}),comparator=createRecoveryScenarioComparator({planner,authorize:()=>true}),budgeting=createScenarioBudget({comparator,authorize:()=>true,verifyRates:()=>ratesCurrent});
 const config={budgeting,authorize:()=>true,verifyBounds:()=>boundsCurrent},range=createBudgetRange(config),request={principal,project,input,scenarios:data.scenarios,lowerRateCard:data.rateCard,upperRateCard:data.upperRateCard,budget:data.budget,timeUnit:data.timeUnit};
 return {range,request,config,budgeting,revokeBounds:()=>{boundsCurrent=false;},revokeRates:()=>{ratesCurrent=false;}};
}
test('actual fixed-schedule cost ranges distinguish robust and price-sensitive options and retain review obligations',async()=>{
 const s=setup(),before=JSON.stringify(s.request),result=s.range.analyze(s.request),base=result.scenarios.find(r=>r.id==='base'),fast=result.scenarios.find(r=>r.id==='fast');
 assert.equal(result.status,'BUDGET_RANGE_ANALYZED');assert.equal(base.minimumEstimatedCost,'92.05');assert.equal(base.maximumEstimatedCost,'184.10');assert.equal(fast.maximumEstimatedCost,'199.10');assert.deepEqual(result.withinAllModeledRatesScenarioIds,['base']);assert.deepEqual(result.rateSensitiveScenarioIds,['fast']);assert.deepEqual(result.earliestWithinAllModeledRatesScenarioIds,['base']);assert.deepEqual(base.requiresApprovalTaskIds,['review']);assert.equal(result.actionsExecuted,0);assert.equal(JSON.stringify(s.request),before);
 const noop=()=>({unused:true}),events=[],api=createAuditedNativeServices({experience:{remember:noop,recall:noop,forget:noop},recovery:{propose:noop},budgetRanges:s.range,audit:{record:e=>events.push(e)}});assert.deepEqual(await api.budgetRanges.analyze(s.request),result);assert.deepEqual(events.map(e=>e.outcome),['intent','completed']);
 const run=spawnSync(process.execPath,[path.join(__dirname,'../budget-project.cjs'),path.join(__dirname,'../examples/project-budget-range.json'),'--range'],{encoding:'utf8',timeout:10000});assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout).withinAllModeledRatesScenarioIds,['base']);
});
test('lower-bound overruns and zero rates have explicit outcomes without probabilities',()=>{
 const s=setup();const tight=s.range.analyze({...s.request,budget:{currency:'IRT',amount:'95'}});assert.deepEqual(tight.rateSensitiveScenarioIds,['base']);assert.deepEqual(tight.overBudgetAtLowerRatesScenarioIds,['fast']);
 for(const card of [s.request.lowerRateCard,s.request.upperRateCard]){card.resourceRates.team='0';card.overheadRate='0';card.fixedCosts={base:'0',fast:'0'};}
 const zero=s.range.analyze({...s.request,budget:{currency:'IRT',amount:'0'}});assert.deepEqual(zero.withinAllModeledRatesScenarioIds,['base','fast']);assert.deepEqual(zero.earliestWithinAllModeledRatesScenarioIds,['fast']);assert.equal(zero.scenarios[0].maximumEstimatedCost,'0.00');
});
test('cost endpoints retain exact large monetary values without Number conversion',()=>{
 const s=setup();s.request.lowerRateCard.resourceRates.team='9007199254740993.01';s.request.upperRateCard.resourceRates.team='18014398509481986.02';for(const card of [s.request.lowerRateCard,s.request.upperRateCard]){card.overheadRate='0';card.fixedCosts={base:'0',fast:'0'};}
 const result=s.range.analyze({...s.request,budget:{currency:'IRT',amount:'999999999999999999999999'}});assert.equal(result.scenarios[0].minimumEstimatedCost,'72057594037927944.08');assert.equal(result.scenarios[0].maximumEstimatedCost,'144115188075855888.16');
});
test('inverted bounds, mixed units, mismatched rounding and missing rate identifiers are refused',()=>{
 const s=setup(),upper=s.request.upperRateCard;
 assert.throws(()=>s.range.analyze({...s.request,upperRateCard:{...upper,resourceRates:{team:'1'}}}),/Inverted/);assert.throws(()=>s.range.analyze({...s.request,upperRateCard:{...upper,currency:'IRR'}}),/matching/);assert.throws(()=>s.range.analyze({...s.request,upperRateCard:{...upper,timeUnit:'hour'}}),/matching/);assert.throws(()=>s.range.analyze({...s.request,upperRateCard:{...upper,rounding:{...upper.rounding,mode:'half_even'}}}),/matching/);assert.throws(()=>s.range.analyze({...s.request,upperRateCard:{...upper,resourceRates:{}}}),/identifiers/);
});
test('revoked bounds or rates and denied scopes never yield an uncertainty assessment',()=>{
 const s=setup();s.revokeBounds();assert.throws(()=>s.range.analyze(s.request),/bounds not verified/);const other=setup();other.revokeRates();assert.throws(()=>other.range.analyze(other.request),/rates and budget not verified/);
 assert.throws(()=>other.range.analyze({...other.request,principal:{...other.request.principal,capabilityIds:[]}}),/denied/);assert.throws(()=>other.range.analyze({...other.request,project:{id:'foreign',orgId:'local'}}),/denied/);
});
test('unknown progress and infeasible schedules stay unknown; endpoint source changes invalidate comparison',()=>{
 const s=setup(),blocked=s.range.analyze({...s.request,input:{...s.request.input,observations:[]}});assert.equal(blocked.status,'EVIDENCE_RECONCILIATION_REQUIRED');assert.deepEqual(blocked.withinAllModeledRatesScenarioIds,[]);
 const partial=s.range.analyze({...s.request,input:{...s.request.input,horizon:8}});assert.equal(partial.scenarios.find(r=>r.id==='base').minimumEstimatedCost,undefined);
 let calls=0;const inconsistent=createBudgetRange({...s.config,budgeting:{compare:input=>{const report=s.budgeting.compare(input);if(++calls===2)report.comparisonDigest='changed-current-data';return report;}}});assert.throws(()=>inconsistent.analyze(s.request),/evidence changed/);
});
