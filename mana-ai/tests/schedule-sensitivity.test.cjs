'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createScheduleSensitivity}=require('../src/native/schedule-sensitivity.cjs');
const {createAuditedNativeServices}=require('../src/native/audited-services.cjs');
function setup(capacity=1){
 const project={id:'p',orgId:'org'},principal={id:'u',orgId:'org',role:'analyst',projectIds:['p'],capabilityIds:['native.schedule.propose','native.schedule.analyze']};
 const input={principal,project,tasks:[{id:'designA',duration:4,dependsOn:[],resources:{team:1}},{id:'designB',duration:2,dependsOn:[],resources:{team:1}},{id:'review',duration:1,dependsOn:['designA','designB'],resources:{}}],capacities:{team:capacity},horizon:20,taskIds:['designA','designB'],delayUnits:1};
 const analyzer=createScheduleSensitivity({authorize:()=>true,verifyInputs:()=>true});return {input,analyzer};
}
test('actual rescheduling finds resource-sensitive work even when precedence-only float is positive',()=>{
 const {input,analyzer}=setup(),before=JSON.stringify(input),report=analyzer.analyze(input),b=report.analyses.find(t=>t.taskId==='designB');
 assert.equal(report.status,'SENSITIVITY_ANALYZED');assert.equal(report.baselineMakespan,7);assert.equal(report.precedenceMakespan,5);assert.equal(b.precedenceFloat,2);assert.equal(b.onPrecedenceCriticalPath,false);assert.equal(b.resourceStartDelay,4);assert.equal(b.precedenceFinishIncrease,0);assert.equal(b.finishChange,1);assert.equal(b.status,'DELAY_SENSITIVE_IN_THIS_RUN');assert.deepEqual(report.unprobedTaskIds,['review']);assert.equal(report.actionsExecuted,0);assert.equal(JSON.stringify(input),before);
});
test('available parallel capacity absorbs the same delay and CPM critical work still affects finish',()=>{
 const {input,analyzer}=setup(2),report=analyzer.analyze(input),a=report.analyses.find(t=>t.taskId==='designA'),b=report.analyses.find(t=>t.taskId==='designB');
 assert.equal(report.baselineMakespan,5);assert.equal(a.onPrecedenceCriticalPath,true);assert.equal(a.finishChange,1);assert.equal(b.finishChange,0);assert.equal(b.status,'DELAY_ABSORBED_IN_THIS_RUN');assert.deepEqual(report.attentionOrderTaskIds,['designA','designB']);
});
test('horizon failures are explicit and repeated analysis is deterministic',()=>{
 const {input,analyzer}=setup();input.horizon=7;const report=analyzer.analyze(input);assert.ok(report.analyses.every(t=>t.status==='NO_SCHEDULE_WITHIN_HORIZON'));assert.deepEqual(report,analyzer.analyze(input));
 assert.equal(analyzer.analyze({...input,horizon:6}).status,'BASELINE_INFEASIBLE');
});
test('sensitivity rejects stale authority, missing grants, cross-project access and unbounded probes',()=>{
 const {input,analyzer}=setup();assert.throws(()=>createScheduleSensitivity({authorize:()=>true,verifyInputs:()=>false}).analyze(input),/verified/);assert.throws(()=>analyzer.analyze({...input,principal:{...input.principal,capabilityIds:[]}}),/denied/);assert.throws(()=>analyzer.analyze({...input,project:{id:'foreign',orgId:'org'}}),/denied/);
 assert.throws(()=>analyzer.analyze({...input,taskIds:['missing']}),/Unknown/);assert.throws(()=>analyzer.analyze({...input,taskIds:['designA','designA']}),/sixteen/);assert.throws(()=>analyzer.analyze({...input,delayUnits:0}),/delay/);assert.throws(()=>analyzer.analyze({...input,taskIds:Array.from({length:17},(_,i)=>'task'+i)}),/sixteen/);
});
test('local analysis CLI and audited sensitivity boundary use the actual analyzer',async()=>{
 const path=require('node:path'),{spawnSync}=require('node:child_process');
 const run=spawnSync(process.execPath,[path.join(__dirname,'../analyze-schedule.cjs'),path.join(__dirname,'../examples/schedule-sensitivity.json')],{encoding:'utf8',timeout:10000});assert.equal(run.status,0,run.stderr);const report=JSON.parse(run.stdout);assert.equal(report.baselineMakespan,7);assert.match(report.evidenceAuthority,/local operator/);
 const {input,analyzer}=setup(),events=[],noop=()=>({unused:true}),api=createAuditedNativeServices({experience:{remember:noop,recall:noop,forget:noop},recovery:{propose:noop},sensitivity:analyzer,audit:{record:event=>events.push(event)}});assert.deepEqual(await api.sensitivity.analyze(input),analyzer.analyze(input));assert.deepEqual(events.map(e=>e.outcome),['intent','completed']);
});
