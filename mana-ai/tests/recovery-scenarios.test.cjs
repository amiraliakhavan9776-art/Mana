'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createRecoveryScenarioComparator}=require('../src/native/recovery-scenarios.cjs');
const {createProjectMonitor}=require('../src/native/project-monitor.cjs');
const {createProjectRecoveryPlanner}=require('../src/native/project-recovery.cjs');
const {scheduleProject}=require('../src/native/resource-scheduler.cjs');
const {createAuditedNativeServices}=require('../src/native/audited-services.cjs');
function setup(){
 const project={id:'p',orgId:'org'},principal={id:'u',orgId:'org',role:'analyst',projectIds:['p'],capabilityIds:['native.schedule.propose','native.project.monitor','native.project.replan','native.recovery.scenarios']};
 const schedule=scheduleProject({principal,project,tasks:[{id:'designA',duration:4,dependsOn:[],resources:{team:1}},{id:'designB',duration:4,dependsOn:[],resources:{team:1}},{id:'review',duration:1,dependsOn:['designA','designB'],resources:{}}],capacities:{team:1}});schedule.tasks.find(t=>t.id==='review').requiresApproval=true;
 const observations=schedule.tasks.map(t=>({taskId:t.id,organizationId:'org',projectId:'p',progressBps:0,observedAt:1,evidenceRef:'receipt-'+t.id}));
 const input={schedule,observations,weights:{designA:1,designB:1,review:1},asOf:1,horizon:30};let approved=true;
 const monitor=createProjectMonitor({authorize:()=>true,verifyBaseline:()=>true,verifyObservation:()=>true}),planner=createProjectRecoveryPlanner({monitor,authorize:()=>true,verifyEstimates:()=>approved});
 const comparator=createRecoveryScenarioComparator({planner,authorize:()=>true});
 const scenario=(id,capacity,duration)=>({id,capacities:{team:capacity},remainingEstimates:{designA:{duration,resources:{team:1}},designB:{duration,resources:{team:1}},review:{duration:1,resources:{}}}});
 return {principal,project,input,comparator,scenario,revoke:()=>{approved=false;}};
}
test('real recovery scenarios expose faster completion versus peak staffing without silently choosing one',async()=>{
 const s=setup(),request={principal:s.principal,project:s.project,input:s.input,scenarios:[s.scenario('base',1,4),s.scenario('parallel',2,4),s.scenario('slower',1,5)]},before=JSON.stringify(request),result=s.comparator.compare(request);
 assert.equal(result.status,'SCENARIOS_COMPARED');assert.deepEqual(result.earliestFinishScenarioIds,['parallel']);assert.deepEqual(result.nonDominatedScenarioIds,['base','parallel']);
 const base=result.scenarios.find(r=>r.id==='base'),fast=result.scenarios.find(r=>r.id==='parallel'),slow=result.scenarios.find(r=>r.id==='slower');assert.equal(base.makespan,10);assert.equal(fast.makespan,6);assert.equal(base.resourceEffort.team,fast.resourceEffort.team);assert.equal(base.peakResourceDemand.team,1);assert.equal(fast.peakResourceDemand.team,2);assert.ok(slow.dominatedByScenarioIds.includes('base'));assert.deepEqual(fast.requiresApprovalTaskIds,['review']);assert.equal(result.actionsExecuted,0);assert.equal(JSON.stringify(request),before);
 const events=[],noop=()=>({unused:true}),api=createAuditedNativeServices({experience:{remember:noop,recall:noop,forget:noop},recovery:{propose:noop},scenarios:s.comparator,audit:{record:e=>events.push(e)}});assert.deepEqual(await api.scenarios.compare(request),result);assert.deepEqual(events.map(e=>e.outcome),['intent','completed']);
});
test('infeasible horizons are visible, incomplete evidence blocks all comparisons, invalid authority is never hidden as infeasibility',()=>{
 const s=setup(),ctx={principal:s.principal,project:s.project,input:{...s.input,horizon:8},scenarios:[s.scenario('base',1,4),s.scenario('parallel',2,4)]};let result=s.comparator.compare(ctx);assert.equal(result.scenarios[0].status,'NO_SCHEDULE_WITHIN_HORIZON');assert.deepEqual(result.earliestFinishScenarioIds,['parallel']);
 result=s.comparator.compare({...ctx,input:{...s.input,observations:[]}});assert.equal(result.status,'EVIDENCE_RECONCILIATION_REQUIRED');assert.deepEqual(result.scenarios,[]);
 assert.throws(()=>s.comparator.compare({...ctx,scenarios:[ctx.scenarios[0],ctx.scenarios[0]]}),/duplicate/);assert.throws(()=>s.comparator.compare({...ctx,principal:{...s.principal,capabilityIds:[]}}),/denied/);assert.throws(()=>s.comparator.compare({...ctx,project:{id:'foreign',orgId:'org'}}),/denied/);s.revoke();assert.throws(()=>s.comparator.compare(ctx),/verified/);
});
test('resource metrics use own demands even for resource names inherited from Object.prototype',()=>{
 const s=setup(),scenario=s.scenario('named',2,4);scenario.capacities.toString=1;scenario.remainingEstimates.review.resources={toString:1};
 const result=s.comparator.compare({principal:s.principal,project:s.project,input:s.input,scenarios:[scenario]});assert.equal(result.scenarios[0].resourceEffort.toString,1);assert.equal(result.scenarios[0].peakResourceDemand.toString,1);assert.equal(result.scenarios[0].resourceEffort.team,8);
});
