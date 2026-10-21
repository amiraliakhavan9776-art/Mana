# Mana AI — secure mobile and desktop sync acceptance criteria

Current code includes an optional conversation API and an encrypted scoped storage module. They are not yet wired to real login or a mobile sync UI.

Before enabling access on devices:

1. Use a trusted authentication system; never accept user or organization IDs directly from browser input.
2. Validate organization membership and conversation permissions on every request.
3. Require HTTPS with private-network access where practical. Keep the prototype loopback server private.
4. Require CSRF protection for state-changing browser requests, strict origins, rate limits and session expiry.
5. Persist AES-GCM encryption keys in a secret manager; implement backup, rotation and deletion.
6. Add server-assigned conversation IDs, authorized conversation listing and safe pagination.
7. Test user A vs user B and organization A vs organization B; test restart and simultaneous writes.
8. Run Node tests and actual iPhone, Android and desktop end-to-end tests before deployment.

No production-ready authentication, cross-device synchronization or live deployment is claimed.
