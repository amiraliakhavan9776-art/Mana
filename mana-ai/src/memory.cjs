'use strict';
const { can, hasProjectGrant } = require('./security.cjs');
function createConversationMemory({ maxTurns = 6, maxSessions = 100 } = {}) {
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 20) throw new Error('Invalid memory limit');
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 10000) throw new Error('Invalid session limit');
  const sessions = new Map();
  function key(principal, projectId, sessionId) {
    if (!can(principal, 'projects:read')) throw new Error('Permission denied');
    if (typeof projectId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(projectId)) throw new Error('Invalid project');
    if (!hasProjectGrant(principal, projectId)) throw new Error('Project not found');
    if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(sessionId)) throw new Error('Invalid session');
    return JSON.stringify([principal.orgId, principal.id, projectId, sessionId]);
  }
  return {
    read({ principal, projectId, sessionId }) {
      return (sessions.get(key(principal, projectId, sessionId)) || []).map(t => ({...t}));
    },
    append({ principal, projectId, sessionId, question, answer }) {
      if (typeof question !== 'string' || typeof answer !== 'string' || question.length > 4000 || answer.length > 16000) throw new Error('Invalid turn');
      const k = key(principal, projectId, sessionId);
      const turns = sessions.get(k) || [];
      turns.push({ question, answer });
      while (turns.length > maxTurns) turns.shift();
      sessions.delete(k);
      sessions.set(k, turns);
      while (sessions.size > maxSessions) sessions.delete(sessions.keys().next().value);
    },
    clear({ principal, projectId, sessionId }) { sessions.delete(key(principal, projectId, sessionId)); }
  };
}
module.exports = { createConversationMemory };
