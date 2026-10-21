'use strict';
const { can } = require('./security.cjs');
function createConversationMemory({ maxTurns = 6 } = {}) {
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 20) throw new Error('Invalid memory limit');
  const sessions = new Map();
  function key(principal, projectId, sessionId) {
    if (!can(principal, 'projects:read')) throw new Error('Permission denied');
    if (typeof projectId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(projectId)) throw new Error('Invalid project');
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
      sessions.set(k, turns);
    },
    clear({ principal, projectId, sessionId }) { sessions.delete(key(principal, projectId, sessionId)); }
  };
}
module.exports = { createConversationMemory };
