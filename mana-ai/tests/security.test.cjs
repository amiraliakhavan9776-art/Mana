'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePrincipals, authenticate, can } = require('../src/security.cjs');
const { validateProjects, projectsFor } = require('../src/projects.cjs');
const { createAuditLog } = require('../src/audit.cjs');
const secret = 'local-test-secret-at-least-32-characters';
test('roles are least privilege', () => {
  const [p] = normalizePrincipals([{ id: 'v1', orgId: 'org1', role: 'viewer', token: secret }]);
  assert.equal(can(p, 'projects:read'), true);
  assert.equal(can(p, 'audit:read'), false);
  assert.equal(can(p, 'projects:write'), false);
  assert.equal(authenticate('Bearer ' + secret, [p]), p);
  assert.equal(authenticate('Bearer wrong', [p]), null);
});
test('rejects invalid or duplicate identities', () => {
  const p = { id: 'v1', orgId: 'org1', role: 'viewer', token: secret };
  assert.throws(() => normalizePrincipals([{ ...p, role: 'root' }]));
  assert.throws(() => normalizePrincipals([p, p]));
});
test('projects are organization-scoped and sanitized', () => {
  const data = validateProjects([
    { id: 'p1', orgId: 'org1', name: 'Project A', budget: 500 },
    { id: 'p2', orgId: 'org2', name: 'Project B' }
  ]);
  const visible = projectsFor({ id:'u', orgId:'org1', role:'viewer', projectIds:['p1'] }, data);
  assert.deepEqual(visible, [{ id: 'p1', name: 'Project A' }]);
  assert.throws(() => validateProjects([{ id: 'p1', orgId: 'org1', name: '' }]));
});
test('audit log is organization-scoped and bounded', () => {
  const audit = createAuditLog({ maxEvents: 2 });
  audit.record({ actorId: 'a', orgId: 'org1', action: 'read', outcome: 'allowed' });
  audit.record({ actorId: 'b', orgId: 'org2', action: 'read', outcome: 'denied' });
  audit.record({ actorId: 'c', orgId: 'org1', action: 'read', outcome: 'allowed' });
  assert.equal(audit.list('org1').length, 1);
  assert.equal(audit.list('org2').length, 1);
});
