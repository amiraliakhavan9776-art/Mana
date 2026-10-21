'use strict';
const { can } = require('./security.cjs');
function retrieve({ principal, projectId, question, projects, documents }) {
  if (!can(principal, 'projects:read')) throw new Error('Permission denied');
  if (typeof projectId !== 'string' || !projects.some(p => p.id === projectId && p.orgId === principal.orgId)) throw new Error('Project not found');
  if (typeof question !== 'string') throw new Error('Invalid question');
  const terms = question.toLowerCase().split(/\s+/).filter(t => t.length > 2).slice(0, 20);
  if (!terms.length) return [];
  return documents.filter(d => d.orgId === principal.orgId && d.projectId === projectId)
    .map(d => ({ d, score: terms.filter(t => (d.title + ' ' + d.text).toLowerCase().includes(t)).length }))
    .filter(x => x.score > 0).sort((a,b) => b.score - a.score)
    .slice(0,3).map(({d}) => ({ documentId:d.id, title:d.title, excerpt:d.text.slice(0,1200) }));
}
module.exports = { retrieve };
