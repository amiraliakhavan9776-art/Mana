# Mana AI — local login endpoint pilot

The loopback-only chat server now optionally accepts `sessionAuth` together with `conversationStore`. When configured, `POST /api/auth/login` accepts JSON `{"userId":"...","password":"..."}` and returns an expiring bearer token plus a CSRF proof. That token can be used with the scoped conversation API.

This endpoint is disabled unless a host explicitly passes both components to `start()`. The server is still bound to 127.0.0.1 and is **not** safe for public exposure.

Security limitations: no login throttling, account lockout, persistent accounts, MFA, token rotation or production TLS; bearer tokens are returned in JSON and must not be stored in localStorage. The mobile UI is not yet connected to login. No actual cross-device sync or server deployment is claimed.

Test with Node.js 20+:
```sh
node --test mana-ai/tests/login-server.test.cjs
```

Before enabling mobile access, add per-account/IP rate limits, authenticated HTTPS, session revocation/logout, audited membership, and device integration tests. Never expose the development server directly to the internet.
