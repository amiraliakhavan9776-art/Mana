'use strict';
const fs = require('node:fs');
const { validateProjects } = require('./projects.cjs');

function loadProjectSnapshot(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('Snapshot path required');
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('Snapshot must be a file under 1 MiB');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.projects)) {
    throw new Error('Invalid snapshot schema');
  }
  return validateProjects(raw.projects);
}
module.exports = { loadProjectSnapshot };
