'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {createRecoveryCashflow}=require('../src/native/recovery-cashflow.cjs');
const {createScenarioBudget}=require('../src/native/scenario-budget.cjs');
const {createRecoveryScenarioComparator}=require('../src/native/recovery-scenarios.cjs');
const {createProjectRecoveryPlanner}=require('../src/native/project-recovery.cjs');
const {createProjectMonitor}=require('../src/native/project-monitor.cjs');
const {scheduleProject}=require('../src/native/resource-scheduler.cjs');
const {createAuditedNativeServices}=require('../src/native/audited-services.cjs');
function setup(){
 const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/project-cashflow.json'),'utf8')),project={id:'local',orgId:'local'},principal={id:'u',orgId:'local',role:'analyst',projectIds:['local'],capabilityIds:['native.schedule.propose','native.project.monitor','native.project.replan','native.recovery.scenarios','native.recovery.budget','native.recovery.cashflow']};
 const schedule=scheduleProject({principal,project,tasks:data.tasks,capacities:data.capacities,horizon:data.horizon});schedule.tasks.find(t=>t.id==='review').requiresApproval=true;
 const monitor=createProjectMonitor({authorize:()=>true,verifyBaseline:()=>true,verifyObservation:()=>true}),planner=createProjectRecoveryPlanner({monitor,authorize:()=>true,verifyEstimates:()=>true}),comparator=createRecoveryScenarioComparator({planner,authorize:()=>true}),budgeting=createScenarioBudget({comparator,authorize:()=>true,verifyRates:()=>true});let current=true;
 const config={planner,budgeting,authorize:()=>true,verifyFunding:()=>current},cashflow=createRecoveryCashflow(config),scenario=data.scenarios[0],request={principal,project,input:{schedule,observations:data.observations,weights:data.weights,asOf:data.asOf,horizon:data.horizon},scenario,rateCard:{...data.rateCard,fixedCosts:{base:data.rateCard.fixedCosts.base}},budget:data.budget,timeUnit:data.timeUnit,openingCash:data.cashflow.openingCash,funding:data.cashflow.funding,allocationPolicy:data.cashflow.allocationPolicy};
 return {cashflow,request,config,planner,revoke:()=>{current=false;}};
}
test('actual costed recovery reveals interim liquidity shortage despite positive closing cash and sufficient total budget',()=>{
 const s=setup(),before=JSON.stringify(s.request),report=s.cashflow.analyze(s.request);assert.equal(report.status,'MODELED_CASH_SHORTFALL');assert.equal(report.budgetWithinCeiling,true);assert.equal(report.estimatedTotal,'92.05');assert.equal(report.closingCash,'7.95');assert.equal(report.minimumCash,'-5.40');assert.equal(report.modeledFundingGap,'5.40');assert.equal(report.firstDetectedShortfallAt,5);assert.equal(report.events.find(e=>e.at===5).cashAfterFunding,'54.60');assert.deepEqual(report.requiresApprovalTaskIds,['review']);assert.equal(report.actionsExecuted,0);assert.equal(JSON.stringify(s.request),before);
});
test('earlier funding avoids the modeled gap while funding at completion does not hide prior shortages',()=>{
 const s=setup(),early=s.cashflow.analyze({...s.request,funding:s.request.funding.map(f=>({...f,at:4}))});assert.equal(early.status,'NO_SHORTFALL_IN_MODEL');assert.equal(early.modeledFundingGap,'0.00');
 const late=s.cashflow.analyze({...s.request,funding:s.request.funding.map(f=>({...f,at:10}))});assert.equal(late.closingCash,'7.95');assert.equal(late.minimumCash,'-52.05');
 const funded=s.cashflow.analyze({...s.request,openingCash:{...s.request.openingCash,amount:'100'},funding:[]});assert.equal(funded.status,'NO_SHORTFALL_IN_MODEL');assert.equal(funded.minimumCash,'7.95');
});
test('cumulative monetary rounding reconciles to the same point budget and event deltas telescope exactly',()=>{
 const s=setup();s.request.rateCard.resourceRates.team='0.00125';s.request.rateCard.overheadRate='0.005';s.request.rateCard.fixedCosts.base='0.005';
 for(const [lineRounding,mode,expected] of [['invoice','half_up','0.06'],['per_line','half_up','0.07'],['per_line','half_even','0.05']]){
  s.request.rateCard.rounding={scale:2,mode,lineRounding};const report=s.cashflow.analyze(s.request);assert.equal(report.estimatedTotal,expected);assert.equal(report.events.at(-1).cumulativeSpending,expected);assert.equal(report.events.reduce((sum,e)=>sum+BigInt(e.spendingSincePrevious.replace('.','')),0n),BigInt(expected.replace('.','')));
 }
});
test('funding authority, currency, scale, identifiers, timing and allocation policy are mandatory',()=>{
 const s=setup();assert.throws(()=>s.cashflow.analyze({...s.request,allocationPolicy:'assume-cash-on-time'}),/allocation policy/);assert.throws(()=>s.cashflow.analyze({...s.request,openingCash:{...s.request.openingCash,currency:'IRR'}}),/currency/);assert.throws(()=>s.cashflow.analyze({...s.request,funding:[s.request.funding[0],s.request.funding[0]]}),/duplicate/);assert.throws(()=>s.cashflow.analyze({...s.request,funding:s.request.funding.map(f=>({...f,at:11}))}),/out-of-window/);assert.throws(()=>s.cashflow.analyze({...s.request,funding:s.request.funding.map(f=>({...f,amount:'0.001'}))}),/accounting currency scale/);
 assert.throws(()=>s.cashflow.analyze({...s.request,principal:{...s.request.principal,capabilityIds:[]}}),/denied/);assert.throws(()=>s.cashflow.analyze({...s.request,project:{id:'foreign',orgId:'local'}}),/denied/);s.revoke();assert.throws(()=>s.cashflow.analyze(s.request),/cash and funding not verified/);
 const other=setup();assert.throws(()=>other.cashflow.analyze({...other.request,funding:[other.request.funding[0],{...other.request.funding[0],id:'anotherId'}]}),/Duplicate cash evidence/);
});
test('unknown progress and source changes cannot produce a cash allocation for an unverified schedule',()=>{
 const s=setup();assert.throws(()=>s.cashflow.analyze({...s.request,input:{...s.request.input,observations:[]}}),/feasible costed schedule/);
 const changed=createRecoveryCashflow({...s.config,planner:{propose:input=>{const result=s.planner.propose(input);return {...result,makespan:result.makespan+1};}}});assert.throws(()=>changed.analyze(s.request),/evidence changed/);
});
test('actual cashflow CLI and audited delivery preserve modeled results without recording cash evidence bodies',async()=>{
 const s=setup(),events=[],noop=()=>({unused:true}),api=createAuditedNativeServices({experience:{remember:noop,recall:noop,forget:noop},recovery:{propose:noop},cashflow:s.cashflow,audit:{record:e=>events.push(e)}});assert.equal((await api.cashflow.analyze(s.request)).modeledFundingGap,'5.40');assert.deepEqual(events.map(e=>e.outcome),['intent','completed']);assert.doesNotMatch(JSON.stringify(events),/synthetic-planned-receipt|openingCash/);
 const run=spawnSync(process.execPath,[path.join(__dirname,'../budget-project.cjs'),path.join(__dirname,'../examples/project-cashflow.json'),'--cashflow'],{encoding:'utf8',timeout:10000});assert.equal(run.status,0,run.stderr);const report=JSON.parse(run.stdout);assert.equal(report.modeledFundingGap,'5.40');assert.match(report.evidenceAuthority,/local operator/);
});
