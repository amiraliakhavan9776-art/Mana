'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePrincipals } = require('../src/security.cjs');
const { createServer } = require('../src/server.cjs');
const { createEngine } = require('../src/engine.cjs');
const { createConversationMemory } = require('../src/memory.cjs');
const token = 'project-grants-server-token-with-32-chars';
const projects = [{id:'a',orgId:'org',name:'Allowed'}, {id:'b',orgId:'org',name:'Hidden'}, {id:'c',orgId:'other',name:'Foreign'}];
const documents = projects.map(p => ({id:'d'+p.id,orgId:p.orgId,projectId:p.id,title:'Budget',text:p.name+' budget'}));
test('grants default to none, are immutable and reject malformed configuration', () => {
  const base = {id:'u',orgId:'org',role:'admin',token};
  assert.deepEqual(normalizePrincipals([base])[0].projectIds, []);
  const ids = ['a']; const [principal] = normalizePrincipals([{...base,projectIds:ids}]);
  ids.push('b'); assert.deepEqual(principal.projectIds,['a']);
  assert.throws(() => principal.projectIds.push('b'));
  for (const projectIds of ['*',['a','a'],['../a'],[null]]) assert.throws(() => normalizePrincipals([{...base,projectIds}]));
});
test('same-tenant unauthorized projects are hidden from list, AI and agent HTTP routes', async () => {
  let calls = 0;
  const server = createServer({token,principals:[{id:'u',orgId:'org',role:'admin',token,projectIds:['a','c']}],projects,documents,engine:{ask:async()=>{calls++;return {answer:'ok'}}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const headers={authorization:'Bearer '+token,'content-type':'application/json'};
  const post=(route,body)=>fetch(base+route,{method:'POST',headers,body:JSON.stringify(body)});
  try {
    assert.deepEqual((await (await fetch(base+'/v1/projects',{headers})).json()).projects,[{id:'a',name:'Allowed'}]);
    for (const projectId of ['b','c']) {
      assert.equal((await post('/v1/ai/ask',{projectId,question:'Budget'})).status,404);
      assert.equal((await post('/v1/agent/documents/search',{projectId,question:'Budget'})).status,404);
    }
    assert.equal(calls,0);
    const response=await post('/v1/agent/documents/search',{projectId:'a',question:'Budget'});
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).sources.map(s=>s.documentId),['da']);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
test('revoked grants block model context and previously stored memory', async () => {
  const principal={id:'u',orgId:'org',role:'viewer',projectIds:['a']};
  const memory=createConversationMemory();
  memory.append({principal,projectId:'a',sessionId:'s',question:'secret',answer:'answer'});
  const revoked={...principal,projectIds:[]};
  assert.throws(()=>memory.read({principal:revoked,projectId:'a',sessionId:'s'}),/Project not found/);
  let calls=0;
  const engine=createEngine({model:'test',memory,provider:{complete:async()=>{calls++;return 'ok'}}});
  await assert.rejects(engine.ask({principal:revoked,projectId:'a',projects,documents,question:'Budget',sessionId:'s'}),/Project not found/);
  assert.equal(calls,0);
});

test('audit failure returns a service error rather than disclosing project data or crashing', async () => {
  const server=createServer({token,projects,audit:{record(){throw Error('disk full')},list(){return []}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base='http://127.0.0.1:'+server.address().port;
    const response=await fetch(base+'/v1/projects',{headers:{authorization:'Bearer '+token}});
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'audit_unavailable'});
    assert.equal((await fetch(base+'/healthz')).status,200);
  } finally {await new Promise(resolve=>server.close(resolve))}
});
