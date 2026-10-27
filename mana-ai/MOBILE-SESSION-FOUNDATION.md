# Mana AI — mobile/desktop conversation session foundation

Implemented a small in-memory, expiring session store for the next secure synchronization phase. It generates cryptographically random 256-bit tokens, keeps messages isolated per token, records user and organization IDs, bounds history to 40 messages, and supports expiration/revocation.

**This is not connected to the mobile or desktop HTTP server yet.** It is not a login system, cross-device synchronization, persistent database or production authorization service. Tokens are not persisted and sessions disappear on process restart. The session store has no global memory cap and should not be used at scale without quotas and cleanup scheduling.

Run with Node.js 20+:
```sh
node --test mana-ai/tests/mobile-session.test.cjs
```

Before production: authenticate users through a trusted identity provider; bind organization membership server-side; persist encrypted conversations with retention controls; use authenticated HTTPS sessions, CSRF protection, rate limiting, role permissions and audit; synchronize across devices using a server-side user-scoped conversation ID rather than sharing session tokens.
