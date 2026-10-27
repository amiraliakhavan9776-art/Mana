'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createAuditedNativeServices}=require('../src/native/audited-services.cjs');
const {createMissionExperience}=require('../src/native/mission-experience.cjs');
const {createMissionRuntime}=require('../src/native/mission-runtime.cjs');
const {createProjectMonitor}=require('../src/native/project-monitor.cjs');
const {createProjectRecoveryPlanner}=require('../src/native/project-recovery.cjs');
const {scheduleProject}=require('../src/native/resource-scheduler.cjs');
const {createDurableAuditLog}=require('../src/durable-audit.cjs');
const {createFileAuditAnchor}=require('../src/file-audit-anchor.cjs');
function services(fn){return {experience:{remember:fn,recall:fn,forget:fn},recovery:{propose:fn}};}
test('unavailable synchronous or asynchronous audit prevents service invocation',async()=>{
 for(const record of [()=>{throw Error('offline')},async()=>{throw Error('offline')}]){let calls=0;const api=createAuditedNativeServices({...services(()=>{calls++;return {ok:true}}),audit:{record}});await assert.rejects(api.recovery.propose({}),{code:'AUDIT_INTENT_UNAVAILABLE'});await assert.rejects(api.experience.remember({}),{code:'AUDIT_INTENT_UNAVAILABLE'});assert.equal(calls,0);}
});
test('completion failure withholds results and explicitly distinguishes possible writes from proposals',async()=>{
 for(const mutation of [true,false]){let committed=0;const api=createAuditedNativeServices({...services(()=>{committed++;return {private:'secret'}}),audit:{record:({outcome})=>{if(outcome==='completed')throw Error('disk full')}}});
 await assert.rejects(mutation?api.experience.remember({}):api.recovery.propose({}),error=>error.code==='AUDIT_COMPLETION_UNCONFIRMED'&&error.stateMayHaveChanged===mutation&&typeof error.operationId==='string');assert.equal(committed,1);}
});
test('caller mutation during audit wait cannot change the input bound to the intent',async()=>{
 let release;const records=[],audit={record:event=>{records.push(event);if(event.outcome==='intent')return new Promise(resolve=>{release=resolve;});}};
 const api=createAuditedNativeServices({...services(input=>({value:input.value})),audit}),input={value:'original'},pending=api.recovery.propose(input);input.value='changed';release();assert.deepEqual(await pending,{value:'original'});assert.equal(records.length,2);assert.equal(records[0].requestId,records[1].requestId);assert.equal(records[0].outcome,'intent');assert.equal(records[1].outcome,'completed');
});
test('real mission memory and recovery write chained audit receipts that survive anchored restart',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-audited-services-'));fs.mkdirSync(path.join(dir,'anchor'));const file=path.join(dir,'audit.jsonl'),anchor=createFileAuditAnchor({file:path.join(dir,'anchor','state'),key:Buffer.alloc(32,5),auditId:'test-audit'});let audit=createDurableAuditLog(file,{anchor});t.after(()=>{audit.close();fs.rmSync(dir,{recursive:true,force:true});});
 const project={id:'p',orgId:'org'},principal={id:'u',orgId:'org',role:'analyst',projectIds:['p'],capabilityIds:['inspect',...['create','read','run'].map(x=>'native.mission.'+x),...['write','read','delete'].map(x=>'native.experience.'+x),'native.schedule.propose','native.project.monitor','native.project.replan']};
 const runtime=createMissionRuntime({file:path.join(dir,'missions'),key:Buffer.alloc(32,1),authorize:()=>true,tools:[{id:'inspect',title:'Inspect',requires:['source'],produces:['checked'],workUnits:1,risk:'read',version:'v1',validate:()=>true,validateDependencies:()=>true,run:async()=>({private:'PRIVATE_RESULT'}),verify:()=>true}]});
 const mission=runtime.create({principal,project,objective:'PRIVATE_OBJECTIVE',goals:['checked'],evidence:[{id:'e',orgId:'org',projectId:'p',key:'source',value:true,source:'synthetic',verification:'verified'}],inputs:{inspect:{}},requestKey:'once'}).mission,ctx={principal,project,missionId:mission.id};await runtime.runNext(ctx);
 const experience=createMissionExperience({file:path.join(dir,'experience'),key:Buffer.alloc(32,2),runtime,authorize:()=>true,verifyConsent:()=>true});
 const monitor=createProjectMonitor({authorize:()=>true,verifyBaseline:()=>true,verifyObservation:()=>true}),recovery=createProjectRecoveryPlanner({monitor,authorize:()=>true,verifyEstimates:()=>true}),api=createAuditedNativeServices({experience,recovery,audit});
 assert.equal((await api.experience.remember({...ctx,consentId:'PRIVATE_CONSENT'})).stored,true);assert.equal((await api.experience.recall(ctx)).length,1);
 const schedule=scheduleProject({principal,project,tasks:[{id:'inspect',duration:1,dependsOn:[],resources:{team:1}}],capacities:{team:1}});
 const result=await api.recovery.propose({principal,project,schedule,weights:{inspect:1},observations:[{taskId:'inspect',organizationId:'org',projectId:'p',progressBps:10000,observedAt:1,evidenceRef:'PRIVATE_EVIDENCE'}],asOf:1,remainingEstimates:{},capacities:{team:1},horizon:10});assert.equal(result.status,'NO_REMAINING_WORK');
 await assert.rejects(api.experience.recall({...ctx,principal:{...principal,capabilityIds:[]}}),/denied/);
 assert.equal(audit.list('org').length,8);assert.equal(audit.list('org').at(-1).outcome,'operation_failed');const checkpoint=audit.checkpoint();audit.close();audit=createDurableAuditLog(file,{anchor});assert.deepEqual(audit.checkpoint(),checkpoint);assert.doesNotMatch(fs.readFileSync(file,'utf8'),/PRIVATE_/);assert.equal((await createAuditedNativeServices({experience,recovery,audit}).experience.forget(ctx)).removed,1);
});
