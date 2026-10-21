'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createConversationMemory } = require('../src/memory.cjs');
const { createEngine } = require('../src/engine.cjs');
const a = {id:'a',orgId:'org1',role:'viewer'};
const b = {id:'b',orgId:'org1',role:'viewer'};
test('session memory is scoped to user, organization and project', () => {
  const memory = createConversationMemory({maxTurns:2});
  memory.append({principal:a,projectId:'p1',sessionId:'s1',question:'first',answer:'one'});
  assert.equal(memory.read({principal:a,projectId:'p1',sessionId:'s1'}).length,1);
  assert.deepEqual(memory.read({principal:b,projectId:'p1',sessionId:'s1'}),[]);
  assert.deepEqual(memory.read({principal:a,projectId:'p2',sessionId:'s1'}),[]);
  memory.append({principal:a,projectId:'p1',sessionId:'s1',question:'second',answer:'two'});
  memory.append({principal:a,projectId:'p1',sessionId:'s1',question:'third',answer:'three'});
  assert.deepEqual(memory.read({principal:a,projectId:'p1',sessionId:'s1'}).map(x=>x.question),['second','third']);
  memory.clear({principal:a,projectId:'p1',sessionId:'s1'});
  assert.deepEqual(memory.read({principal:a,projectId:'p1',sessionId:'s1'}),[]);
});
test('engine remembers previous turn only in authorized session', async () => {
  const calls=[];
  const engine=createEngine({model:'test',provider:{complete:async req=>{calls.push(req.messages);return 'answer';}}});
  const projects=[{id:'p1',orgId:'org1',name:'Test'}];
  await engine.ask({principal:a,question:'hello',projectId:'p1',sessionId:'s1',projects});
  await engine.ask({principal:a,question:'follow up',projectId:'p1',sessionId:'s1',projects});
  assert.equal(calls[1].some(m=>m.role==='user'&&m.content==='hello'),true);
  await assert.rejects(engine.ask({principal:b,question:'hello',projectId:'p2',sessionId:'s1',projects}),/Project not found/);
});
