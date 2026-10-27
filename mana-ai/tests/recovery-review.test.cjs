'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApprovalStore}=require('../src/approval-store.cjs');
const {createRecoveryReview}=require('../src/native/recovery-review.cjs');
const {createProjectRecoveryPlanner}=require('../src/native/project-recovery.cjs');
const {createProjectMonitor}=require('../src/native/project-monitor.cjs');
const {scheduleProject}=require('../src/native/resource-scheduler.cjs');
const {createAuditedNativeServices}=require('../src/native/audited-services.cjs');
function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-recovery-review-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let clock=1000,approverCurrent=true;
 const project={id:'p',orgId:'org'},principal={id:'requester',orgId:'org',role:'analyst',projectIds:['p'],capabilityIds:['native.schedule.propose','native.project.monitor','native.project.replan',...['request','approve','read'].map(x=>'native.recovery.review.'+x)]},reviewer={...principal,id:'reviewer'};
 const schedule=scheduleProject({principal,project,tasks:[{id:'review',duration:1,dependsOn:[],resources:{team:1}}],capacities:{team:1}});schedule.tasks[0].requiresApproval=true;
 const input={schedule,weights:{review:1},observations:[{taskId:'review',organizationId:'org',projectId:'p',progressBps:0,observedAt:1,evidenceRef:'receipt'}],asOf:1,remainingEstimates:{review:{duration:2,resources:{team:1}}},capacities:{team:1},horizon:10};
 const monitor=createProjectMonitor({authorize:()=>true,verifyBaseline:()=>true,verifyObservation:()=>true}),planner=createProjectRecoveryPlanner({monitor,authorize:()=>true,verifyEstimates:()=>true});
 const approvalConfig={file:path.join(dir,'approvals'),key:Buffer.alloc(32,7),now:()=>clock,authorize:(who,_op,record)=>who.orgId===record.orgId&&record.projectId==='p'};
 const approvals=createApprovalStore(approvalConfig),config={planner,approvals,now:()=>clock,authorize:(_p,operation)=>operation==='recovery.review.revalidate-approver'?approverCurrent:true},review=createRecoveryReview(config);
 return {principal,reviewer,project,input,approvals,approvalConfig,config,review,advance:()=>{clock=3000;},revoke:()=>{approverCurrent=false;}};
}
test('review request, independent decision and current receipt pass through the audited boundary',async t=>{
 const s=setup(t),events=[],noop=()=>({unused:true}),api=createAuditedNativeServices({experience:{remember:noop,recall:noop,forget:noop},recovery:{propose:noop},review:s.review,audit:{record:event=>events.push(event)}});
 const request=await api.review.request({principal:s.principal,project:s.project,input:s.input});
 await api.review.decide({principal:s.reviewer,project:s.project,approvalId:request.approval.id,approve:true,reason:'Reviewed',input:s.input});
 const result=await api.review.current({principal:s.principal,project:s.project,approvalId:request.approval.id,input:s.input});assert.equal(result.reviewApproved,true);assert.equal(events.length,6);assert.deepEqual(events.map(e=>e.outcome),['intent','completed','intent','completed','intent','completed']);assert.equal(events[2].actorId,'reviewer');assert.doesNotMatch(JSON.stringify(events),/remainingEstimates|Reviewed|evidenceRef/);
});
test('actual schedule-monitor-recovery-review chain requires independent approval and survives encrypted restart',t=>{
 const s=setup(t),before=JSON.stringify(s.input),request=s.review.request({principal:s.principal,project:s.project,input:s.input,ttlMs:1000}),id=request.approval.id;
 assert.throws(()=>s.review.decide({principal:s.principal,project:s.project,approvalId:id,approve:true,reason:'self',input:s.input}),/Self approval/);
 s.review.decide({principal:s.reviewer,project:s.project,approvalId:id,approve:true,reason:'Reviewed remaining work',input:s.input});
 const restarted=createRecoveryReview({...s.config,approvals:createApprovalStore(s.approvalConfig)}),receipt=restarted.current({principal:s.principal,project:s.project,approvalId:id,input:s.input});
 assert.equal(receipt.status,'REVIEW_APPROVED_CURRENT');assert.equal(receipt.executionAuthorized,false);assert.equal(receipt.baselineChanged,false);assert.equal(s.approvals.inspect({principal:s.principal,approvalId:id}).status,'approved');assert.equal(JSON.stringify(s.input),before);
});
test('changed estimates cannot be approved and cannot reuse an earlier independent review',t=>{
 const s=setup(t),id=s.review.request({principal:s.principal,project:s.project,input:s.input}).approval.id,changed={...s.input,remainingEstimates:{review:{duration:3,resources:{team:1}}}};
 assert.throws(()=>s.review.decide({principal:s.reviewer,project:s.project,approvalId:id,approve:true,reason:'review',input:changed}),/changed/);
 s.review.decide({principal:s.reviewer,project:s.project,approvalId:id,approve:true,reason:'review',input:s.input});
 assert.equal(s.review.current({principal:s.principal,project:s.project,approvalId:id,input:changed}).status,'REVIEW_BINDING_CHANGED');
 assert.equal(s.review.current({principal:s.principal,project:s.project,approvalId:id,input:{...s.input,asOf:2}}).status,'REVIEW_BINDING_CHANGED');
});
test('expiry, cancellation, revoked reviewer and rejected decisions never become current approval',t=>{
 const s=setup(t),id=s.review.request({principal:s.principal,project:s.project,input:s.input,ttlMs:1000}).approval.id,ctx={principal:s.principal,project:s.project,approvalId:id,input:s.input};
 s.review.decide({...ctx,principal:s.reviewer,approve:true,reason:'review'});s.revoke();assert.equal(s.review.current(ctx).status,'REVIEW_AUTHORITY_REVOKED');s.advance();assert.equal(s.review.current(ctx).status,'REVIEW_NOT_CURRENT');
 const other=setup(t),rejected=other.review.request({principal:other.principal,project:other.project,input:other.input}).approval.id;
 other.review.decide({principal:other.reviewer,project:other.project,approvalId:rejected,approve:false,reason:'Needs revised evidence'});assert.equal(other.review.current({principal:other.principal,project:other.project,approvalId:rejected,input:other.input}).reviewApproved,false);
 const cancelled=other.review.request({principal:other.principal,project:other.project,input:other.input}).approval.id;other.approvals.cancel({principal:other.principal,approvalId:cancelled,reason:'withdrawn'});assert.equal(other.review.current({principal:other.principal,project:other.project,approvalId:cancelled,input:other.input}).reviewApproved,false);
});
test('approval inspection is read-authorized and recovery review refuses foreign scopes and other action types',t=>{
 const s=setup(t),id=s.review.request({principal:s.principal,project:s.project,input:s.input}).approval.id;
 assert.throws(()=>s.review.current({principal:{...s.principal,capabilityIds:[]},project:s.project,approvalId:id,input:s.input}),/denied/);
 assert.throws(()=>s.review.current({principal:s.principal,project:{id:'foreign',orgId:'org'},approvalId:id,input:s.input}),/denied/);
 const denied=createApprovalStore({...s.approvalConfig,authorize:()=>false});assert.throws(()=>denied.inspect({principal:s.principal,approvalId:id}),/permission denied/);
 const unrelated=s.approvals.request({principal:s.principal,action:'unrelated',projectId:'p',resourceId:'p',dataVersion:'v1',toolVersion:'v1',payload:{x:1}});
 assert.throws(()=>s.review.decide({principal:s.reviewer,project:s.project,approvalId:unrelated.id,approve:false,reason:'wrong action'}),/type mismatch/);
});
