'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {run}=require('../autopilot-demo.cjs');
const input={organization:'Mana',profession:'معماری و ساختمان',goals:['کنترل هزینه']};
test('offline demo creates plan but executes no drafts without approval',async()=>{
 const result=await run(input);
 assert.equal(result.mode,'OFFLINE_DEMO_MOCK_NOT_AI');
 assert.equal(result.plan.status,'DRAFT_NOT_EXECUTED');
 assert.equal(result.drafts.length,0);assert.equal(result.audit.length,0);
});
test('explicit approval generates local drafts and audit events',async()=>{
 const result=await run(input,{approve:true});
 assert.equal(result.drafts.length,3);assert.equal(result.audit.length,3);
 assert.ok(result.drafts.every(d=>d.externalActions===0));
});
