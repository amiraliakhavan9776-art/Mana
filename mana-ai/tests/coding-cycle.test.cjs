'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { codingCycle } = require('../src/native/coding-cycle.cjs');
async function fakeDraft({ request, workspace, propose }) {
  fs.mkdirSync(workspace, { recursive: true, mode: 0o700 });
  const raw = await propose({ instruction: request });
  const out = JSON.parse(raw);
  const directory = path.join(workspace, 'draft');
  const candidate = path.join(directory, 'candidate');
  fs.mkdirSync(candidate, { recursive: true, mode: 0o700 });
  for (const file of out.files) fs.writeFileSync(path.join(candidate, file.path), file.content);
  return { status: 'CODE_DRAFT_AWAITING_SANDBOX', directory, files: out.files.map(f => ({ path: f.path })) };
}
function setup(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mana-cycle-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const projectRoot = path.join(tmp, 'src');
  fs.mkdirSync(projectRoot, { mode: 0o700 });
  fs.writeFileSync(path.join(projectRoot, 'test.py'), 'x = 0\n');
  return { projectRoot, workspace: path.join(tmp, 'review'),
    request: 'Implement function for a genuinely independent arithmetic test suite',
    allowedFiles: ['test.py'] };
}
test('failed sandbox check triggers bounded code repair and awaits human review', async t => {
  const opts = setup(t);
  let proposed = 0;
  const result = await codingCycle({ ...opts, draft: fakeDraft,
    propose: async () => JSON.stringify({ files: [{ path: 'test.py', content: `x = ${++proposed}\n` }] }),
    verify: async ({ candidateDir, attempt }) => {
      assert.equal(fs.readFileSync(path.join(candidateDir, 'test.py'), 'utf8'), `x = ${attempt}\n`);
      return attempt === 1
        ? { status: 'FAILED', executed: true, passed: false, summary: 'assert expected 2' }
        : { status: 'PASSED', executed: true, passed: true, summary: 'Independent sandbox tests passed' };
    }
  });
  assert.equal(proposed, 2);
  assert.equal(result.status, 'SANDBOX_PASSED_AWAITING_HUMAN_REVIEW');
  assert.equal(result.attempts.length, 2);
  assert.equal(fs.readFileSync(path.join(opts.projectRoot, 'test.py'), 'utf8'), 'x = 0\n');
  assert.equal(result.productionDeploymentAllowed, false);
  assert.ok(fs.existsSync(result.receiptPath));
});
test('sandbox unavailable never becomes success or causes another attempt', async t => {
  const opts = setup(t);
  let count = 0;
  const result = await codingCycle({ ...opts, draft: fakeDraft, propose: async () => {
    count++; return JSON.stringify({ files: [{ path: 'test.py', content: 'x=1' }] });
  }, verify: async () => { throw Error('bubblewrap missing'); } });
  assert.equal(count, 1);
  assert.equal(result.status, 'SANDBOX_UNAVAILABLE');
});
test('independent verifier is mandatory; fake success claims rejected', async t => {
  const opts = setup(t);
  await assert.rejects(codingCycle({ ...opts, draft: fakeDraft, propose: async () => '{}'}), /verifier required/);
  await assert.rejects(codingCycle({ ...opts, draft: fakeDraft, propose: async () => JSON.stringify({ files: [{ path: 'test.py', content: 'pass' }] }),
    verify: async () => ({ status: 'PASSED', executed: false, passed: true }) }), /Malformed/);
});
