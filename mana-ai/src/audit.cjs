'use strict';
function createAuditLog({ maxEvents = 1000 } = {}) {
  if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 100000) throw new Error('Invalid audit limit');
  const events = [];
  return {
    record({ actorId, orgId, action, outcome }) {
      const event = Object.freeze({
        timestamp: new Date().toISOString(),
        actorId: actorId || 'anonymous',
        orgId: orgId || null,
        action,
        outcome
      });
      events.push(event);
      if (events.length > maxEvents) events.shift();
    },
    list(orgId) {
      return events.filter(e => e.orgId === orgId).map(e => ({ ...e }));
    }
  };
}
module.exports = { createAuditLog };
