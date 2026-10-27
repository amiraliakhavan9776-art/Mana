'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {scheduleProject,scheduleMissionPlan}=require('../src/native/resource-scheduler.cjs');
const project={id:'p',orgId:'org'},principal={id:'u',orgId:'org',role:'analyst',projectIds:['p'],capabilityIds:['native.schedule.propose']};
const task=(id,duration,dependsOn=[],resources={crew:1})=>({id,duration,dependsOn,resources});
test('dependencies and shared resources yield bounded offline schedule without treating it as execution',()=>{
 const result=scheduleProject({principal,project,capacities:{crew:1},tasks:[task('inspect',2),task('review',3,['inspect']),task('draft',2,['review']),task('independent',1)]});assert.equal(result.status,'SCHEDULE_PROPOSED');assert.equal(result.makespan,8);assert.equal(result.precedenceLowerBound,7);assert.equal(result.actionsExecuted,0);
 for(const row of result.tasks)for(const dep of row.dependsOn)assert.ok(result.tasks.find(t=>t.id===dep).finish<=row.start);
 for(let time=0;time<result.makespan;time++)assert.ok(result.tasks.filter(t=>t.start<=time&&t.finish>time).reduce((sum,t)=>sum+t.resources.crew,0)<=1);
});
test('different resources permit parallel work and sparse event scheduling handles long durations',()=>{
 const result=scheduleProject({principal,project,capacities:{crew:1,design:1},tasks:[task('a',500000,[],{crew:1}),task('b',500000,[],{design:1})]});assert.equal(result.makespan,500000);assert.deepEqual(result.tasks.map(t=>t.start),[0,0]);
});
test('cycles, excess demand, scope loss and insufficient horizon never produce a schedule',()=>{
 const base={principal,project,capacities:{crew:1},tasks:[task('a',3),task('b',3)]};assert.equal(scheduleProject({...base,horizon:5}).status,'NO_SCHEDULE_WITHIN_HORIZON');
 assert.throws(()=>scheduleProject({...base,principal:{...principal,projectIds:[]}}),/denied/);assert.throws(()=>scheduleProject({...base,tasks:[task('a',1,['b']),task('b',1,['a'])]}),/Cyclic/);assert.throws(()=>scheduleProject({...base,tasks:[task('a',1,[],{crew:2})]}),/capacity/);
});
test('mission plan bridge requires explicit estimates, preserves signoff and rejects foreign plans',()=>{
 const plan={status:'PLAN_PROPOSED',organizationId:'org',projectId:'p',steps:[{taskId:'task-1',dependsOn:[],capabilityId:'inspect',requiresApproval:false},{taskId:'task-2',dependsOn:['task-1'],capabilityId:'regulated',requiresApproval:true,requiresProfessionalSignoff:true}]};
 const estimates={'task-1':{duration:2,resources:{crew:1}},'task-2':{duration:3,resources:{crew:1}}},args={principal,project,plan,estimates,capacities:{crew:1}};
 const result=scheduleMissionPlan(args);assert.equal(result.makespan,5);assert.equal(result.tasks[1].requiresProfessionalSignoff,true);assert.equal(result.tasks[1].requiresApproval,true);
 assert.throws(()=>scheduleMissionPlan({...args,plan:{...plan,projectId:'foreign'}}));assert.throws(()=>scheduleMissionPlan({...args,estimates:{'task-1':estimates['task-1']}}));
});
