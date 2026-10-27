'use strict';
const { canAccessProject } = require('./security.cjs');
function validateProjects(input) {
  if (!Array.isArray(input) || input.length > 10000) throw new Error('Invalid projects fixture');
  const ids = new Set();
  return input.map(p => {
    if (!p || typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(p.id) ||
        typeof p.orgId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(p.orgId) ||
        typeof p.name !== 'string' || p.name.length > 200 || !p.name.trim() ||
        ids.has(p.id)) throw new Error('Invalid project');
    ids.add(p.id);
    return Object.freeze({ id: p.id, orgId: p.orgId, name: p.name });
  });
}
function projectsFor(principal, projects) {
  return projects.filter(p => canAccessProject(principal, p))
    .map(p => ({ id: p.id, name: p.name }));
}
module.exports = { validateProjects, projectsFor };
