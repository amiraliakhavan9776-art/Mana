'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { retrieve } = require('../src/retrieval.cjs');
const { validateDocuments } = require('../src/documents.cjs');
const { createEngine } = require('../src/engine.cjs');
const projects = [{id:'p1',orgId:'o1',name:'First'},{id:'p2',orgId:'o2',name:'Second'}];
const principal = {id:'u1',orgId:'o1',role:'viewer'};
const documents = validateDocuments([
  {id:'d1',orgId:'o1',projectId:'p1',title:'Schedule',text:'Monday planning meeting'},
  {id:'d2',orgId:'o2',projectId:'p2',title:'Schedule',text:'Monday confidential plan'}
]);
test('retrieval excludes other tenants and projects', () => {
  const hits = retrieve({principal,projectId:'p1',question:'Monday schedule',projects,documents});
  assert.deepEqual(hits.map(h => h.documentId), ['d1']);
  assert.doesNotMatch(JSON.stringify(hits), /confidential/);
  assert.throws(() => retrieve({principal,projectId:'p2',question:'Monday',projects,documents}), /Project not found/);
});
test('engine cites retrieved source metadata without returning document text', async () => {
  let prompt;
  const engine = createEngine({model:'test',provider:{complete:async req => {prompt=req.messages;return 'Example answer';}}});
  const result = await engine.ask({principal,projectId:'p1',question:'Monday schedule',projects,documents});
  assert.deepEqual(result.sources,[{documentId:'d1',title:'Schedule'}]);
  assert.match(JSON.stringify(prompt), /Monday planning meeting/);
  assert.doesNotMatch(JSON.stringify(prompt), /confidential/);
});
test('invalid documents are rejected', () => {
  assert.throws(() => validateDocuments([{id:'d',orgId:'o1',projectId:'p1',title:'',text:'test'}]), /Invalid document/);
});
