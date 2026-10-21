'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/server.cjs');
const { createAuditLog } = require('../src/audit.cjs');
const users = [
  { id: 'viewer1', orgId: 'org1', role: 'viewer', token: 'org1-viewer-token-with-at-least-32-chars' },
  { id: 'admin1', orgId: 'org1', role: 'admin', token: 'org1-admin-token-with-at-least-32-chars' },
  { id: 'viewer2', orgId: 'org2', role: 'viewer', token: 'org2-viewer-token-with-at-least-32-chars' }
];
async function run(fn) {
  const server = createServer({ token: users[0].token, principals: users,
    projects: [{ id: 'a', orgId: 'org1', name: 'Alpha' }, { id: 'b', orgId: 'org2', name: 'Beta' }],
    audit: createAuditLog() });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const headers = p => ({ authorization: 'Bearer ' + p.token });
test('project lists cannot cross organizations', async () => run(async base => {
  const a = await fetch(base + '/v1/projects', { headers: headers(users[0]) });
  const b = await fetch(base + '/v1/projects', { headers: headers(users[2]) });
  assert.deepEqual((await a.json()).projects, [{ id: 'a', name: 'Alpha' }]);
  assert.deepEqual((await b.json()).projects, [{ id: 'b', name: 'Beta' }]);
}));
test('only admin can inspect own organization audit', async () => run(async base => {
  const denied = await fetch(base + '/v1/audit', { headers: headers(users[0]) });
  assert.equal(denied.status, 403);
  const allowed = await fetch(base + '/v1/audit', { headers: headers(users[1]) });
  assert.equal(allowed.status, 200);
  const events = (await allowed.json()).events;
  assert.ok(events.some(e => e.action === '/v1/audit' && e.outcome === 'forbidden'));
  assert.ok(events.every(e => e.orgId === 'org1'));
}));
test('no write endpoint is enabled', async () => run(async base => {
  const response = await fetch(base + '/v1/projects', { method: 'POST', headers: headers(users[1]) });
  assert.equal(response.status, 405);
}));
