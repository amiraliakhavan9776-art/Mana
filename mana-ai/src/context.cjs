'use strict';
const { canAccessProject } = require('./security.cjs');
const { can } = require('./security.cjs');
function projectContext({ principal, projects, projectId }) {
  if (!can(principal, 'projects:read')) throw new Error('Permission denied');
  if (typeof projectId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(projectId)) {
    throw new Error('Invalid project ID');
  }
  const p = projects.find(item => item.id === projectId && canAccessProject(principal, item));
  if (!p) return null;
  // This is a deliberately narrow allowlist; no financial, personal or confidential fields.
  return Object.freeze({ id: p.id, name: p.name });
}
module.exports = { projectContext };
