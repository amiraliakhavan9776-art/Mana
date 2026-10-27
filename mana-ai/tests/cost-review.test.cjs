'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApprovalStore}=require('../src/approval-store.cjs');
const {createCostReview}=require('../src/native/cost-review.cjs');
const {createRecoveryReview}=require('../src/native/recovery-review.cjs');
const {createBudgetRange}=require('../src/native/budget-range.cjs');
const {createScenarioBudget}=require('../src/native/scenario-budget.cjs');
const {createRecoveryScenarioComparator}=require('../src/native/recovery-scenarios.cjs');
const {createProjectRecoveryPlanner}=require('../src/native/project-recovery.cjs');
const {createProjectMonitor}=require('../src/native/project-monitor.cjs');
const {scheduleProject}=require('../src/native/resource-scheduler.cjs');
const {createAuditedNativeServices}=require('../src/native/audited-services.cjs');
function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-cost-review-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/project-budget-range.json'),'utf8'));
 const project={id:'local',orgId:'local'},principal={id:'requester',orgId:'local',role:'analyst',projectIds:['local'],capabilityIds:['native.schedule.propose','native.project.monitor','native.project.replan','native.recovery.scenarios','native.recovery.budget','native.recovery.budget.range','native.recovery.review.request',...['request','approve','read'].map(x=>'native.recovery.cost.review.'+x)]},reviewer={...principal,id:'reviewer'};
 const schedule=scheduleProject({principal,project,tasks:data.tasks,capacities:data.capacities,horizon:data.horizon});schedule.tasks.find(t=>t.id==='review').requiresProfessionalSignoff=true;
 const planning={schedule,observations:data.observations,weights:data.weights,asOf:data.asOf,horizon:data.horizon};let clock=1000,currentReviewer=true,currentRates=true;
 const monitor=createProjectMonitor({authorize:()=>true,verifyBaseline:()=>true,verifyObservation:()=>true}),planner=createProjectRecoveryPlanner({monitor,authorize:()=>true,verifyEstimates:()=>true}),comparator=createRecoveryScenarioComparator({planner,authorize:()=>true}),budgeting=createScenarioBudget({comparator,authorize:()=>true,verifyRates:()=>currentRates}),budgetRanges=createBudgetRange({budgeting,authorize:()=>true,verifyBounds:()=>true});
 const approvalConfig={file:path.join(dir,'approvals'),key:Buffer.alloc(32,4),now:()=>clock,authorize:(who,_op,record)=>who.orgId===record.orgId&&record.projectId==='local'},approvals=createApprovalStore(approvalConfig),config={budgetRanges,approvals,now:()=>clock,authorize:(_who,op)=>op==='recovery.cost.review.revalidate-approver'?currentReviewer:true};
 const review=createCostReview(config),input={scenarioId:'base',analysis:{input:planning,scenarios:data.scenarios,lowerRateCard:data.rateCard,upperRateCard:data.upperRateCard,budget:data.budget,timeUnit:data.timeUnit}};
 return {principal,reviewer,project,input,review,config,approvalConfig,approvals,planner,advance:()=>{clock=3000;},revokeReviewer:()=>{currentReviewer=false;},revokeRates:()=>{currentRates=false;}};
}
test('actual priced-range review requires independent decision and survives encrypted restart without adopting a baseline',t=>{
 const s=setup(t),ctx={principal:s.principal,project:s.project,input:s.input},before=JSON.stringify(s.input),request=s.review.request({...ctx,ttlMs:1000});assert.equal(request.proposal.selectedScenario.maximumEstimatedCost,'184.10');assert.deepEqual(request.proposal.selectedScenario.requiresProfessionalSignoffTaskIds,['review']);
 assert.throws(()=>s.review.decide({...ctx,approvalId:request.approval.id,approve:true,reason:'self'}),/Self approval/);s.review.decide({...ctx,principal:s.reviewer,approvalId:request.approval.id,approve:true,reason:'Independent cost review'});
 const restarted=createCostReview({...s.config,approvals:createApprovalStore(s.approvalConfig)}),receipt=restarted.current({...ctx,approvalId:request.approval.id});assert.equal(receipt.reviewApproved,true);assert.equal(receipt.executionAuthorized,false);assert.equal(receipt.baselineChanged,false);assert.equal(JSON.stringify(s.input),before);
});
test('changed ceiling or reviewed rates cannot reuse a pending or completed cost review',t=>{
 const s=setup(t),ctx={principal:s.principal,project:s.project,input:s.input},id=s.review.request(ctx).approval.id,changed={...s.input,analysis:{...s.input.analysis,budget:{currency:'IRT',amount:'191'}}};
 assert.throws(()=>s.review.decide({...ctx,principal:s.reviewer,approvalId:id,approve:true,reason:'review',input:changed}),/changed/);assert.equal(s.approvals.inspect({principal:s.principal,approvalId:id}).status,'pending');s.review.decide({...ctx,principal:s.reviewer,approvalId:id,approve:true,reason:'review'});assert.equal(s.review.current({...ctx,approvalId:id,input:changed}).status,'REVIEW_BINDING_CHANGED');
 const repriced={...s.input,analysis:{...s.input.analysis,upperRateCard:{...s.input.analysis.upperRateCard,resourceRates:{team:'20.21'}}}};assert.equal(s.review.current({...ctx,approvalId:id,input:repriced}).reviewApproved,false);
});
test('price-sensitive or over-budget alternatives cannot enter this within-range cost review',t=>{
 const s=setup(t),ctx={principal:s.principal,project:s.project};assert.throws(()=>s.review.request({...ctx,input:{...s.input,scenarioId:'fast'}}),/within all reviewed/);assert.throws(()=>s.review.request({...ctx,input:{...s.input,analysis:{...s.input.analysis,budget:{currency:'IRT',amount:'50'}}}}),/within all reviewed/);
});
test('expiry, reviewer revocation and invalid rate authority deny current review',t=>{
 const s=setup(t),ctx={principal:s.principal,project:s.project,input:s.input},id=s.review.request({...ctx,ttlMs:1000}).approval.id;s.review.decide({...ctx,principal:s.reviewer,approvalId:id,approve:true,reason:'review'});s.revokeReviewer();assert.equal(s.review.current({...ctx,approvalId:id}).status,'REVIEW_AUTHORITY_REVOKED');s.advance();assert.equal(s.review.current({...ctx,approvalId:id}).status,'REVIEW_NOT_CURRENT');
 const other=setup(t),octx={principal:other.principal,project:other.project,input:other.input},oid=other.review.request(octx).approval.id;other.review.decide({...octx,principal:other.reviewer,approvalId:oid,approve:true,reason:'review'});other.revokeRates();assert.throws(()=>other.review.current({...octx,approvalId:oid}),/rates and budget not verified/);
});
test('scoped cost review cannot consume an ordinary schedule review or a cancelled record',t=>{
 const s=setup(t),ctx={principal:s.principal,project:s.project,input:s.input};assert.throws(()=>s.review.request({...ctx,principal:{...s.principal,capabilityIds:[]}}),/denied/);assert.throws(()=>s.review.request({...ctx,project:{id:'foreign',orgId:'local'}}),/denied/);
 const ordinary=createRecoveryReview({planner:s.planner,approvals:s.approvals,authorize:()=>true}),id=ordinary.request({principal:s.principal,project:s.project,input:{...s.input.analysis.input,...s.input.analysis.scenarios[0]}}).approval.id;assert.throws(()=>s.review.current({...ctx,approvalId:id}),/type mismatch/);
 const cancelled=s.review.request(ctx).approval.id;s.approvals.cancel({principal:s.principal,approvalId:cancelled,reason:'withdrawn'});assert.equal(s.review.current({...ctx,approvalId:cancelled}).reviewApproved,false);
});
test('cost review intent, independent decision and current receipt use the audited boundary',async t=>{
 const s=setup(t),noop=()=>({unused:true}),events=[],api=createAuditedNativeServices({experience:{remember:noop,recall:noop,forget:noop},recovery:{propose:noop},costReview:s.review,audit:{record:e=>events.push(e)}}),ctx={principal:s.principal,project:s.project,input:s.input};
 const request=await api.costReview.request(ctx);await api.costReview.decide({...ctx,principal:s.reviewer,approvalId:request.approval.id,approve:true,reason:'PRIVATE_REVIEW_REASON'});assert.equal((await api.costReview.current({...ctx,approvalId:request.approval.id})).reviewApproved,true);assert.equal(events.length,6);assert.doesNotMatch(JSON.stringify(events),/PRIVATE_REVIEW_REASON|resourceRates|budgetAmount/);
});
