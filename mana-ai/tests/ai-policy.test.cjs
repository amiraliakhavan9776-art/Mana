'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/server.cjs');
const TOKEN = 'test-only-token-with-at-least-32-characters';
async function withServer(fn) {
  let calls = 0;
  const server = createServer({token:TOKEN,projects:[{id:'p1',orgId:'local',name:'Project'}],engine:{ask:async () => {calls++;return {answer:'ok'};}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try { await fn('http://127.0.0.1:'+server.address().port,()=>calls); }
  finally { await new Promise(resolve=>server.close(resolve)); }
}
test('AI endpoint rejects unauthenticated requests', async () => withServer(async (base,calls) => {
  const r=await fetch(base+'/v1/ai/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:'hello'})});
  assert.equal(r.status,401);
  assert.equal(calls(),0);
}));
test('AI endpoint does not call model for missing project', async () => withServer(async (base,calls) => {
  const r=await fetch(base+'/v1/ai/ask',{method:'POST',headers:{authorization:'Bearer '+TOKEN,'content-type':'application/json'},body:JSON.stringify({question:'hello',projectId:'not_here'})});
  assert.equal(r.status,404);
  assert.equal(calls(),0);
}));
test('AI endpoint rejects oversized JSON before calling model', async () => withServer(async (base,calls) => {
  const r=await fetch(base+'/v1/ai/ask',{method:'POST',headers:{authorization:'Bearer '+TOKEN,'content-type':'application/json'},body:JSON.stringify({question:'x'.repeat(9000)})});
  assert.equal(r.status,413);
  assert.equal(calls(),0);
}));
