'use strict';
const HIGH_RISK = new Set(['payments:execute','contracts:sign','records:delete','design:safety-signoff','permissions:grant','secrets:export']);
const ACTIONS = new Set(['research:public','documents:read','strategy:draft',...HIGH_RISK]);
function authorizeAction({ principal, action, approved = false, scope }) {
  if (!principal || typeof principal.orgId !== 'string' || typeof principal.id !== 'string') throw new Error('Unauthenticated');
  if (!ACTIONS.has(action)) throw new Error('Unknown action');
  if (typeof scope !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(scope)) throw new Error('Invalid scope');
  if (HIGH_RISK.has(action)) return Object.freeze({ allowed:false, requiresHumanApproval:true, reason:'High-risk action unavailable in foundation mode' });
  if (action === 'research:public' && approved !== true) return Object.freeze({ allowed:false, requiresHumanApproval:true, reason:'External research requires explicit approval' });
  if (!['admin','analyst','viewer'].includes(principal.role)) return Object.freeze({ allowed:false, requiresHumanApproval:false, reason:'Role not permitted' });
  if (action === 'strategy:draft' && principal.role === 'viewer') return Object.freeze({ allowed:false, requiresHumanApproval:false, reason:'Role not permitted' });
  return Object.freeze({ allowed:true, requiresHumanApproval:false, reason:'Read-only or draft action' });
}
module.exports = { authorizeAction, HIGH_RISK };
