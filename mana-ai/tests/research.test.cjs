'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createResearch } = require('../src/research.cjs');
test('research requires explicit public-only approval', async () => {
  let called = false;
  const research = createResearch({search: async () => {called = true;return [];}});
  await assert.rejects(research.lookup({query:'construction standards'}),/public-only/);
  assert.equal(called,false);
});
test('research preserves source URLs but does not claim verification', async () => {
  const research = createResearch({search:async () => [{title:'Example',url:'https://example.org/article',snippet:'Public information'}]});
  const results = await research.lookup({query:'public example',publicOnly:true});
  assert.equal(results[0].verified,false);
  assert.equal(results[0].url,'https://example.org/article');
});
test('research rejects unsafe links and oversized queries', async () => {
  const research = createResearch({search:async () => [{title:'Bad',url:'http://example.org',snippet:'test'}]});
  await assert.rejects(research.lookup({query:'test',publicOnly:true}),/Unsafe/);
  await assert.rejects(research.lookup({query:'x'.repeat(301),publicOnly:true}),/Invalid query/);
});
