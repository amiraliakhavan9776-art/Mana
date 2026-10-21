# Mana AI — local account session module

The new `src/session-auth.cjs` module hashes passwords using Node.js scrypt with a per-user random salt, checks them without plaintext storage, issues random expiring bearer tokens and CSRF secrets, and supplies server-side organization/user scope to the conversation API.

It is **not** mounted in the server or mobile UI yet. It does not create a login page, persist accounts or sessions, implement MFA, account lockout, rate limiting, recovery or trusted reverse proxy configuration. The module stores tokens in process memory; restart invalidates sessions. It is a development foundation, not a production identity system.

Test with Node.js 20+:
```sh
node --test mana-ai/tests/session-auth.test.cjs
```

Next: build a dedicated login route with strict rate limits and origin checks, integrate authenticated conversation requests, persist identities in an audited identity system, and use HTTPS/VPN for device access. Do not expose the loopback development server publicly.
