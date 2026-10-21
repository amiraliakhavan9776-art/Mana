'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine, createLocalOpenAICompatibleProvider } = require('../src/engine.cjs');
const principal = { id: 'test', orgId: 'local', role: 'viewer' };
test('AI engine uses a safe, read-only provider contract', async () => {
  let call;
  const engine = createEngine({ model: 'local-model', provider: { complete: async req => {
    call = req; return 'A general answer';
  } } });
  const result = await engine.ask({ principal, question: 'Hello' });
  assert.equal(result.answer, 'A general answer');
  assert.equal(result.actionsExecuted, false);
  assert.equal(result.dataConnected, false);
  assert.equal(call.messages[0].role, 'system');
  assert.equal(call.messages[1].content, 'Hello');
});
test('engine rejects invalid requests and roles', async () => {
  const engine = createEngine({ model: 'test', provider: { complete: async () => 'ok' } });
  await assert.rejects(engine.ask({ principal, question: '' }), /Invalid question/);
  await assert.rejects(engine.ask({ principal: null, question: 'hello' }), /Permission denied/);
  await assert.rejects(engine.ask({ principal, question: 'a'.repeat(4001) }), /Invalid question/);
});
test('local provider refuses remote or credential-bearing endpoints', () => {
  assert.throws(() => createLocalOpenAICompatibleProvider({ baseUrl: 'https://example.com/' }));
  assert.throws(() => createLocalOpenAICompatibleProvider({ baseUrl: 'http://user:pass@localhost:11434/' }));
  assert.doesNotThrow(() => createLocalOpenAICompatibleProvider({ baseUrl: 'http://127.0.0.1:11434/' }));
});
