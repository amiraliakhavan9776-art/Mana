'use strict';
const { createHash, timingSafeEqual } = require('node:crypto');

const ROLES = Object.freeze({
  viewer: ['capabilities:read', 'projects:read'],
  analyst: ['capabilities:read', 'projects:read', 'strategy:read'],
  admin: ['capabilities:read', 'projects:read', 'strategy:read', 'audit:read']
});
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
function tokenFingerprint(token) {
  return createHash('sha256').update(token).digest('hex');
}
function normalizePrincipals(principals) {
  if (!Array.isArray(principals)) throw new Error('Principals must be an array');
  const seen = new Set(), hashes = new Set();
  return principals.map(p => {
    if (!p || typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(p.id) ||
        typeof p.orgId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(p.orgId) ||
        !Object.hasOwn(ROLES, p.role) || typeof p.token !== 'string' || p.token.length < 32) {
      throw new Error('Invalid principal configuration');
    }
    const hash = tokenFingerprint(p.token);
    if (seen.has(p.id) || hashes.has(hash)) throw new Error('Duplicate principal');
    seen.add(p.id); hashes.add(hash);
    return Object.freeze({ id: p.id, orgId: p.orgId, role: p.role, token: p.token });
  });
}
function authenticate(header, principals) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const supplied = header.slice(7);
  // Compare against every configured token; do not expose token material in responses or audit logs.
  let matched = null;
  for (const p of principals) if (safeEqual(supplied, p.token)) matched = p;
  return matched;
}
function can(principal, permission) {
  return !!principal && (ROLES[principal.role] || []).includes(permission);
}
module.exports = { ROLES, safeEqual, normalizePrincipals, authenticate, can };
