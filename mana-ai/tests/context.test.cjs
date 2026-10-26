'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../src/engine.cjs');
const { createServer } = require('../src/server.cjs');
const token = 'context-test-token-at-least-32-characters';
const projects = [
  { id: 'alpha', orgId: 'org1', name: 'Alpha Project' },
  { id: 'beta', orgId: 'org2', name: 'Secret Beta Project' }
];
const principal = { id: 'viewer1', orgId: 'org1', role: 'viewer', projectIds: ['alpha'] };
test('only requested same-organization project metadata reaches provider', async () => {
  let captured;
  const engine = createEngine({ model: 'test', provider: { complete: async req => {
    captured = req.messages; return 'Sample response';
  } } });
  const response = await engine.ask({ principal, question: 'Describe the project', projectId: 'alpha', projects });
  assert.equal(response.dataConnected, true);
  assert.deepEqual(response.contextSources, [{ type: 'project-metadata', projectId: 'alpha' }]);
  assert.match(JSON.stringify(captured), /Alpha Project/);
  assert.doesNotMatch(JSON.stringify(captured), /Secret Beta Project/);
});
test('cross-organization project IDs are rejected before model invocation', async () => {
  let invoked = false;
  const engine = createEngine({ model: 'test', provider: { complete: async () => {
    invoked = true; return 'no';
  } } });
  await assert.rejects(engine.ask({ principal, question: 'test', projectId: 'beta', projects }), /Project not found/);
  assert.equal(invoked, false);
});
test('HTTP request can select a project but cannot supply arbitrary context', async () => {
  const engine = createEngine({ model: 'test', provider: { complete: async () => 'ok' } });
  const server = createServer({ token, principals: [{ ...principal, token }], projects, engine });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/v1/ai/ask';
    const request = body => fetch(url, { method: 'POST', headers: {
      authorization: 'Bearer ' + token, 'content-type': 'application/json'
    }, body: JSON.stringify(body) });
    const ok = await request({ question: 'What is this project?', projectId: 'alpha' });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).dataConnected, true);
    const denied = await request({ question: 'Tell me', projectId: 'beta' });
    assert.equal(denied.status, 404);
    const injected = await request({ question: 'Tell me', context: 'secret' });
    assert.equal(injected.status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
