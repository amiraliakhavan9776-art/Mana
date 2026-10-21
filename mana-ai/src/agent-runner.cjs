'use strict';
const { authorizeAction } = require('./governance.cjs');
const { can } = require('./security.cjs');
function createAgentRunner({ tools = {}, audit, timeoutMs = 5000 } = {}) {
  if (!audit || typeof audit.record !== 'function') throw new Error('Audit required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new Error('Invalid timeout');
  const allowed = new Map();
  for (const [name, tool] of Object.entries(tools)) {
    if (!['documents:read','strategy:draft'].includes(name) || typeof tool !== 'function') throw new Error('Unapproved tool');
    allowed.set(name, tool);
  }
  return {
    async execute({ principal, action, scope, input }) {
      const actorId = principal?.id;
      const orgId = principal?.orgId;
      let decision;
      try {
        decision = authorizeAction({principal,action,scope});
        if (!can(principal,'projects:read')) throw new Error('Permission denied');
      } catch (_) {
        audit.record({actorId,orgId,action:'agent:denied',outcome:'denied'});
        return {ok:false,error:'policy_denied'};
      }
      if (!decision.allowed || !allowed.has(action)) {
        audit.record({actorId,orgId,action:'agent:denied',outcome:'denied'});
        return {ok:false,error:'policy_denied'};
      }
      if (!input || typeof input !== 'object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input)) > 4096) {
        audit.record({actorId,orgId,action:'agent:invalid',outcome:'denied'});
        return {ok:false,error:'invalid_input'};
      }
      const controller = new AbortController();
      let timer;
      try {
        const task = Promise.resolve().then(() => allowed.get(action)({principal:{id:principal.id,orgId:principal.orgId,role:principal.role},scope,input:structuredClone(input),signal:controller.signal}));
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Tool timeout')); }, timeoutMs);
        });
        const result = await Promise.race([task, deadline]);
        if (controller.signal.aborted) throw new Error('Tool timeout');
        if (Buffer.byteLength(JSON.stringify(result)) > 16384) throw new Error('Tool output too large');
        audit.record({actorId,orgId,action:'agent:'+action,outcome:'allowed'});
        return {ok:true,result};
      } catch (_) {
        audit.record({actorId,orgId,action:'agent:'+action,outcome:'failed'});
        return {ok:false,error:'tool_failed'};
      } finally {clearTimeout(timer);}
    }
  };
}
module.exports = { createAgentRunner };
