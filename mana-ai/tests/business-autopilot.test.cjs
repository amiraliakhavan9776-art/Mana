'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {blueprint}=require('../src/business-autopilot.cjs');
test('construction profile yields offline scoped blueprint',()=>{
 const b=blueprint({organization:'Mana',profession:'شرکت معماری و ساختمان',goals:['کاهش هزینه']});
 assert.equal(b.sector,'construction');
 assert.ok(b.workflows.includes('Design phases 0/1/2'));
 assert.ok(b.proposedAgents.every(a=>a.enabled===false&&a.actionsExecuted===0));
 assert.equal(b.governance.externalDataTransfer,false);
});
test('generic professions work without sector-specific assumptions',()=>{
 const b=blueprint({organization:'Example',profession:'تولید مبلمان'});
 assert.equal(b.sector,'general');assert.equal(b.status,'PROPOSAL_REQUIRES_HUMAN_REVIEW');
});
test('rejects missing organization and oversized goals',()=>{
 assert.throws(()=>blueprint({profession:'retail'}),/organization/);
 assert.throws(()=>blueprint({profession:'retail',organization:'X',goals:Array(21).fill('x')}),/Too many goals/);
});
