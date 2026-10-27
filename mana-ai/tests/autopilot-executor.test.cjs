'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createDraftExecutor}=require('../src/autopilot-executor.cjs');
const {planBusiness}=require('../src/autopilot-orchestrator.cjs');
const input={organization:'Mana',profession:'ساختمان',goals:['رشد']};
const principal={id:'user-1',permissions:['autopilot:draft']};
async function plan(kind='strategy_brief'){
 return planBusiness({input,model:'local-test',provider:{complete:async()=>JSON.stringify({summary:'Draft plan',tasks:[{kind,reason:'Improve operations'}]})}});
}
test('approved scoped user may generate draft with audit',async()=>{
 const p=await plan(),events=[],executor=createDraftExecutor({audit:e=>events.push(e)});
 const result=executor.execute({plan:p,taskId:'draft-1',principal,approval:true});
 assert.equal(result.status,'DRAFT_CREATED');assert.equal(result.externalActions,0);
 assert.equal(events.length,1);assert.match(result.content,/DRAFT ONLY/);
 assert.throws(()=>executor.execute({plan:p,taskId:'draft-1',principal,approval:true}),/already executed/);
});
test('denies missing permission and approval',async()=>{
 const p=await plan(),e=createDraftExecutor();
 assert.throws(()=>e.execute({plan:p,taskId:'draft-1',principal,approval:false}),/approval/);
 assert.throws(()=>e.execute({plan:p,taskId:'draft-1',principal:{id:'x',permissions:[]},approval:true}),/Permission denied/);
});
test('blocks engineering workflow and unknown task',async()=>{
 const p=await plan('facade_takeoff'),e=createDraftExecutor();
 assert.throws(()=>e.execute({plan:p,taskId:'draft-1',principal,approval:true}),/specialist workflow/);
 assert.throws(()=>e.execute({plan:p,taskId:'missing',principal,approval:true}),/Invalid task/);
});
