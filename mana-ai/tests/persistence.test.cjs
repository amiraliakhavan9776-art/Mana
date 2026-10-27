'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadProjectSnapshot } = require('../src/snapshot.cjs');
const { createDurableAuditLog } = require('../src/durable-audit.cjs');

test('explicit project snapshot is validated and read without mutation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mana-snapshot-'));
  try {
    const file = path.join(dir, 'projects.json');
    const content = JSON.stringify({ schemaVersion: 1, projects: [
      { id: 'p1', orgId: 'org1', name: 'Sample project', budget: 12 }
    ] });
    fs.writeFileSync(file, content);
    assert.deepEqual(loadProjectSnapshot(file), [{ id: 'p1', orgId: 'org1', name: 'Sample project' }]);
    assert.equal(fs.readFileSync(file, 'utf8'), content);
    fs.writeFileSync(file, '{"schemaVersion":0,"projects":[]}');
    assert.throws(() => loadProjectSnapshot(file), /Invalid snapshot schema/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('audit records survive restart and tampering is detected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mana-audit-'));
  try {
    const file = path.join(dir, 'audit.jsonl');
    const first = createDurableAuditLog(file);
    first.record({ actorId: 'user1', orgId: 'org1', action: '/v1/projects', outcome: 'allowed' });
    first.close();
    const second = createDurableAuditLog(file);
    assert.equal(second.list('org1').length, 1);
    second.record({ actorId: 'user2', orgId: 'org2', action: '/v1/projects', outcome: 'forbidden' });
    second.close();
    const raw = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, raw.replace('allowed', 'denied'));
    assert.throws(() => createDurableAuditLog(file), /integrity verification failed/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
