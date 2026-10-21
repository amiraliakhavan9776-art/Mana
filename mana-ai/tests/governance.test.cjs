'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeAction } = require('../src/governance.cjs');
const principal = {id:'user1',orgId:'org1',role:'admin'};
test('unknown and invalid actions fail closed', () => {
  assert.throws(() => authorizeAction({principal,action:'anything:execute',scope:'p1'}),/Unknown action/);
  assert.throws(() => authorizeAction({principal:null,action:'documents:read',scope:'p1'}),/Unauthenticated/);
});
test('high risk actions cannot be executed even when approved', () => {
  for (const action of ['payments:execute','contracts:sign','records:delete','design:safety-signoff','permissions:grant','secrets:export']) {
    const decision = authorizeAction({principal,action,scope:'p1',approved:true});
    assert.equal(decision.allowed,false);
    assert.equal(decision.requiresHumanApproval,true);
  }
});
test('external research needs approval; viewer cannot draft strategy', () => {
  assert.equal(authorizeAction({principal,action:'research:public',scope:'p1'}).allowed,false);
  assert.equal(authorizeAction({principal,action:'research:public',scope:'p1',approved:true}).allowed,true);
  assert.equal(authorizeAction({principal:{...principal,role:'viewer'},action:'strategy:draft',scope:'p1'}).allowed,false);
});
