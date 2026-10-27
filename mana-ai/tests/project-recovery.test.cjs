'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {scheduleProject}=require('../src/native/resource-scheduler.cjs');
const {createProjectMonitor}=require('../src/native/project-monitor.cjs');
const {createProjectRecoveryPlanner}=require('../src/native/project-recovery.cjs');
const {payloadDigest}=require('../src/approval-store.cjs');
function setup(){
 const project={id:'p',orgId:'org'},principal={id:'operator',orgId:'org',role:'analyst',projectIds:['p'],capabilityIds:['native.schedule.propose','native.project.monitor','native.project.replan']};
 const schedule=scheduleProject({principal,project,tasks:[{id:'inspect',duration:2,dependsOn:[],resources:{team:1}},{id:'review',duration:2,dependsOn:['inspect'],resources:{team:1}},{id:'draft',duration:2,dependsOn:['review'],resources:{team:1}}],capacities:{team:1}});
 schedule.tasks[1].requiresApproval=true;schedule.tasks[1].requiresProfessionalSignoff=true;
 const observations=schedule.tasks.map(t=>({taskId:t.id,organizationId:'org',projectId:'p',observedAt:3,progressBps:t.id==='inspect'?10000:t.id==='review'?2500:0,evidenceRef:'receipt-'+t.id}));
 const allowed=new Set(observations.map(payloadDigest)),baselineDigest=payloadDigest(schedule);
 const monitor=createProjectMonitor({authorize:()=>true,verifyBaseline:({digest})=>digest===baselineDigest,verifyObservation:({digest})=>allowed.has(digest)});
 let estimatesAllowed=true;const planner=createProjectRecoveryPlanner({monitor,authorize:()=>true,verifyEstimates:()=>estimatesAllowed});
 const input={principal,project,schedule,observations,weights:{inspect:1,review:1,draft:1},asOf:3,remainingEstimates:{review:{duration:3,resources:{team:1}},draft:{duration:2,resources:{team:1}}},capacities:{team:1},horizon:20};
 return {planner,input,allowed,revoke:()=>{estimatesAllowed=false;}};
}
test('scheduler-monitor-recovery chain preserves obligatory review and omits completed work without changing baseline',()=>{
 const {planner,input}=setup(),before=JSON.stringify(input),proposal=planner.propose(input);
 assert.equal(proposal.status,'RECOVERY_SCHEDULE_PROPOSED');assert.deepEqual(proposal.completedTaskIds,['inspect']);assert.deepEqual(proposal.tasks.map(t=>t.id),['review','draft']);
 assert.equal(proposal.tasks[0].start,3);assert.equal(proposal.tasks[0].finish,6);assert.equal(proposal.tasks[1].finish,8);assert.equal(proposal.tasks[0].requiresApproval,true);assert.equal(proposal.tasks[0].requiresProfessionalSignoff,true);assert.deepEqual(proposal.tasks[0].originalDependsOn,['inspect']);assert.equal(proposal.baselineChanged,false);assert.equal(proposal.actionsExecuted,0);assert.equal(JSON.stringify(input),before);
});
test('missing, stale and contradictory predecessor evidence blocks recovery before estimates are used',()=>{
 const {planner,input,allowed}=setup();assert.equal(planner.propose({...input,observations:input.observations.slice(1)}).status,'EVIDENCE_RECONCILIATION_REQUIRED');assert.equal(planner.propose({...input,asOf:15,maxAge:1}).status,'EVIDENCE_RECONCILIATION_REQUIRED');
 const observations=input.observations.map(t=>t.taskId==='inspect'?{...t,progressBps:0}:t);allowed.add(payloadDigest(observations[0]));assert.equal(planner.propose({...input,observations}).status,'EVIDENCE_RECONCILIATION_REQUIRED');
});
test('recovery refuses missing estimates, stale authority and excess resource demand; short horizon returns no plan',()=>{
 const {planner,input,revoke}=setup();assert.throws(()=>planner.propose({...input,remainingEstimates:{}}),/estimates/);assert.throws(()=>planner.propose({...input,remainingEstimates:{...input.remainingEstimates,inspect:{duration:1,resources:{}}}}),/estimates/);
 assert.throws(()=>planner.propose({...input,remainingEstimates:{...input.remainingEstimates,review:{duration:3,resources:{team:2}}}}),/capacity/);
 assert.equal(planner.propose({...input,horizon:7}).status,'NO_SCHEDULE_WITHIN_HORIZON');
 assert.throws(()=>planner.propose({...input,principal:{...input.principal,capabilityIds:input.principal.capabilityIds.filter(id=>id!=='native.project.replan')}}),/denied/);
 assert.throws(()=>planner.propose({...input,project:{id:'foreign',orgId:'org'}}),/denied/);revoke();assert.throws(()=>planner.propose(input),/verified/);
});
test('complete progress yields no remaining work and never constructs a new execution',()=>{
 const {planner,input,allowed}=setup(),observations=input.observations.map(o=>({...o,progressBps:10000}));for(const row of observations)allowed.add(payloadDigest(row));
 const result=planner.propose({...input,observations,remainingEstimates:{}});assert.equal(result.status,'NO_REMAINING_WORK');assert.deepEqual(result.tasks,[]);assert.equal(result.approved,false);
});
