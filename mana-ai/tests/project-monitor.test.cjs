'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {scheduleProject}=require('../src/native/resource-scheduler.cjs');
const {createProjectMonitor}=require('../src/native/project-monitor.cjs');
const {payloadDigest}=require('../src/approval-store.cjs');
function fixture(){
 const project={id:'p',orgId:'o'},principal={id:'u',orgId:'o',role:'analyst',projectIds:['p'],capabilityIds:['native.schedule.propose','native.project.monitor']};
 const schedule=scheduleProject({principal,project,tasks:[{id:'survey',duration:4,dependsOn:[],resources:{team:1}},{id:'design',duration:4,dependsOn:['survey'],resources:{team:1}}],capacities:{team:1}});
 const observations=[{taskId:'survey',organizationId:'o',projectId:'p',observedAt:6,progressBps:10000,evidenceRef:'signed-survey'},{taskId:'design',organizationId:'o',projectId:'p',observedAt:6,progressBps:2500,evidenceRef:'reviewed-design'}];
 const accepted=new Set(observations.map(payloadDigest));let current=true;
 const monitor=createProjectMonitor({authorize:()=>true,verifyBaseline:({digest})=>current&&digest===payloadDigest(schedule),verifyObservation:({digest})=>current&&accepted.has(digest)});
 const input={principal,project,schedule,observations,weights:{survey:1,design:3},asOf:6};return {monitor,input,revoke:()=>{current=false;}};
}
test('actual resource schedule yields weighted variance and evidence-linked corrective proposals without mutation',()=>{
 const {monitor,input}=fixture(),before=JSON.stringify(input),report=monitor.assess(input);
 assert.equal(report.status,'REVIEW_REQUIRED');assert.equal(report.plannedProgressBps,6250);assert.equal(report.actualProgressBps,4375);assert.equal(report.tasks[1].varianceBps,-2500);assert.equal(report.issues[0].kind,'BEHIND_BASELINE');assert.equal(report.actionsExecuted,0);assert.equal(report.approved,false);assert.equal(JSON.stringify(input),before);assert.equal(report.evidenceDigests.length,2);
});
test('missing or stale evidence never becomes zero progress or a completed aggregate',()=>{
 const {monitor,input}=fixture();const missing=monitor.assess({...input,observations:input.observations.slice(0,1)});assert.equal(missing.status,'EVIDENCE_INCOMPLETE');assert.equal(missing.actualProgressBps,null);assert.equal(missing.tasks[1].actualBps,null);
 const stale=monitor.assess({...input,asOf:10,maxAge:2});assert.equal(stale.actualProgressBps,null);assert.ok(stale.issues.every(i=>i.kind==='STALE_EVIDENCE'));
});
test('current evidence and baseline authority reject tampering, revocation, duplicates and cross-project access',()=>{
 const {monitor,input,revoke}=fixture();assert.throws(()=>monitor.assess({...input,schedule:{...input.schedule,makespan:999}}),/baseline/);
 assert.throws(()=>monitor.assess({...input,observations:[{...input.observations[0],progressBps:0}]}),/verified/);
 assert.throws(()=>monitor.assess({...input,observations:[input.observations[0],input.observations[0]]}),/duplicate/);
 assert.throws(()=>monitor.assess({...input,observations:[{...input.observations[0],projectId:'foreign'}]}),/foreign/);
 assert.throws(()=>monitor.assess({...input,asOf:5}),/evidence/);assert.throws(()=>monitor.assess({...input,principal:{...input.principal,capabilityIds:[]}}),/denied/);
 assert.throws(()=>monitor.assess({...input,project:{id:'foreign',orgId:'o'}}),/denied/);revoke();assert.throws(()=>monitor.assess(input),/baseline/);
});
test('work before verified predecessor completion requires review, including an otherwise ahead task',()=>{
 const {input}=fixture();const observations=input.observations.map(o=>({...o,progressBps:o.taskId==='survey'?5000:10000}));
 const monitor=createProjectMonitor({authorize:()=>true,verifyBaseline:()=>true,verifyObservation:()=>true});const report=monitor.assess({...input,observations});assert.ok(report.issues.some(i=>i.kind==='DEPENDENCY_REVIEW_REQUIRED'&&i.taskId==='design'));
 assert.throws(()=>monitor.assess({...input,weights:{survey:1}}),/weights/);assert.throws(()=>monitor.assess({...input,weights:{survey:1,design:0}}),/weights/);
 const complete=monitor.assess({...input,asOf:8,observations:observations.map(o=>({...o,progressBps:10000,observedAt:8}))});assert.equal(complete.status,'ON_BASELINE_WITHIN_TOLERANCE');assert.equal(complete.actualProgressBps,10000);
});
