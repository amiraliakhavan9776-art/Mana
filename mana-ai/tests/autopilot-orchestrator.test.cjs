'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {planBusiness,parseModelJson}=require('../src/autopilot-orchestrator.cjs');
const input={organization:'Mana',profession:'شرکت معماری و ساختمان',goals:['بهبود بهره وری']};
test('local model output becomes non-executing reviewed plan',async()=>{
 const provider={complete:async({messages})=>{
   assert.match(messages[0].content,/Never claim work was executed/);
   return JSON.stringify({summary:'Suggested plan',tasks:[{kind:'strategy_brief',reason:'Align goals'},{kind:'facade_takeoff',reason:'Quantity verification'}]});
 }};
 const out=await planBusiness({input,provider,model:'local-model'});
 assert.equal(out.status,'DRAFT_NOT_EXECUTED');
 assert.equal(out.actionsExecuted,0);
 assert.equal(out.proposal.tasks[1].approval,'licensed_review');
 assert.ok(out.proposal.tasks.every(t=>!t.executed));
});
test('rejects unapproved tool names and malformed responses',()=>{
 assert.throws(()=>parseModelJson(JSON.stringify({summary:'x',tasks:[{kind:'transfer_money',reason:'x'}]})),/Unknown task/);
 assert.throws(()=>parseModelJson('not json'),/JSON only/);
});
test('rejects invalid local model identifiers',async()=>{
 await assert.rejects(planBusiness({input,provider:{complete:async()=>''},model:'bad model'}),/Invalid model/);
});
