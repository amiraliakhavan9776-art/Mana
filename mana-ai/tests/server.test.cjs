'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, tokenMatches } = require('../src/server.cjs');
const TOKEN = 'test-only-token-with-at-least-32-characters';

async function withServer(fn) {
  const server = createServer({ token: TOKEN });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try { await fn('http://127.0.0.1:' + address.port); }
  finally { await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
}

test('rejects missing and short credentials at startup', () => {
  assert.throws(() => createServer(), /MANA_AI_TOKEN/);
  assert.throws(() => createServer({ token: 'short' }), /MANA_AI_TOKEN/);
});
test('token verification requires an exact match', () => {
  assert.equal(tokenMatches(TOKEN, TOKEN), true);
  assert.equal(tokenMatches('wrong', TOKEN), false);
  assert.equal(tokenMatches(TOKEN + 'x', TOKEN), false);
});
test('health is accessible and no-store', async () => withServer(async base => {
  const r = await fetch(base + '/healthz');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal((await r.json()).status, 'ok');
}));
test('capabilities require bearer token and report disabled AI', async () => withServer(async base => {
  const denied = await fetch(base + '/v1/capabilities');
  assert.equal(denied.status, 401);
  const authorized = await fetch(base + '/v1/capabilities', { headers: { authorization: 'Bearer ' + TOKEN } });
  assert.equal(authorized.status, 200);
  const data = await authorized.json();
  assert.equal(data.aiEnabled, false);
  assert.equal(data.dataConnected, false);
  assert.equal(data.mode, 'read-only-foundation');
}));
test('write requests are disabled and unknown routes return 404', async () => withServer(async base => {
  assert.equal((await fetch(base + '/v1/capabilities', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/v1/unknown', { headers: { authorization: 'Bearer ' + TOKEN } })).status, 404);
}));
