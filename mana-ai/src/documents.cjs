'use strict';
const fs = require('node:fs');
const ID = /^[a-zA-Z0-9_-]{1,64}$/;
function validateDocuments(items) {
  if (!Array.isArray(items) || items.length > 500) throw new Error('Invalid documents');
  const seen = new Set();
  return items.map(d => {
    if (!d || !ID.test(d.id) || !ID.test(d.orgId) || !ID.test(d.projectId) ||
        typeof d.title !== 'string' || !d.title.trim() || d.title.length > 200 ||
        typeof d.text !== 'string' || !d.text.trim() || d.text.length > 12000 ||
        seen.has(d.orgId + ':' + d.id)) throw new Error('Invalid document');
    seen.add(d.orgId + ':' + d.id);
    return Object.freeze({ id:d.id, orgId:d.orgId, projectId:d.projectId, title:d.title.trim(), text:d.text.trim() });
  });
}
function loadDocuments(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > 3 * 1024 * 1024) throw new Error('Invalid document snapshot size');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!data || data.schemaVersion !== 1) throw new Error('Invalid document snapshot');
  return validateDocuments(data.documents);
}
module.exports = { validateDocuments, loadDocuments };
