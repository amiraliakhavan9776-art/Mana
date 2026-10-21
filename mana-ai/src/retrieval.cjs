'use strict';
const { can } = require('./security.cjs');
function normalizeText(value) {
  return value.toLocaleLowerCase('fa').replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک')
    .replace(/[\u200c\u200d]/g, ' ').normalize('NFKC');
}
function termsFor(value) {
  return [...new Set(normalizeText(value).match(/[\p{L}\p{N}]{2,}/gu) || [])].slice(0, 32);
}
function retrieve({ principal, projectId, question, projects, documents }) {
  if (!can(principal, 'projects:read')) throw new Error('Permission denied');
  if (typeof projectId !== 'string' || !projects.some(p => p.id === projectId && p.orgId === principal.orgId)) throw new Error('Project not found');
  if (typeof question !== 'string' || question.length > 4000) throw new Error('Invalid question');
  const terms = termsFor(question);
  if (!terms.length) return [];
  return documents.filter(d => d.orgId === principal.orgId && d.projectId === projectId)
    .map(d => {
      const title = normalizeText(d.title);
      const body = normalizeText(d.text);
      const score = terms.reduce((n, t) => n + (title.includes(t) ? 3 : 0) + (body.includes(t) ? 1 : 0), 0);
      return { d, score };
    }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.d.id.localeCompare(b.d.id))
    .slice(0, 3).map(({ d }) => ({
      documentId: d.id, title: d.title, excerpt: d.text.slice(0, 1200)
    }));
}
module.exports = { retrieve, normalizeText, termsFor };
