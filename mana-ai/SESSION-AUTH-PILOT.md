# Mana AI — local account session module

The new `src/session-auth.cjs` module hashes passwords using Node.js scrypt with a per-user random salt, checks them without plaintext storage, issues random expiring bearer tokens and CSRF secrets, and supplies server-side organization/user scope to the conversation API.

It is optionally injected into the local chat server and used by the secure pilot. Those integration points do not make it a production identity provider. The module itself does not persist accounts/sessions or implement MFA, distributed lockout/rate limiting, account recovery or trusted reverse proxy configuration. The module stores tokens in process memory; restart invalidates sessions. It is a development foundation, not a production identity system.

Test with Node.js 20+:
```sh
node --test mana-ai/tests/session-auth.test.cjs
```

Next: build a dedicated login route with strict rate limits and origin checks, integrate authenticated conversation requests, persist identities in an audited identity system, and use HTTPS/VPN for device access. Do not expose the loopback development server publicly.

## Bounded and validated session state

createSessionAuth accepts maxSessions (default 1000, allowed range 1–100000). Login prunes expired entries; at capacity it refuses a new session without evicting existing valid sessions. Revocation still frees capacity. Host login throttling remains necessary; this is a memory bound, not a replacement for rate limiting.
Account identifiers require actual strings and account records are copied/frozen at configuration time. Mutable caller configuration cannot redirect later logins to another organization. Session clock values are validated and one issued-at value determines both stored and returned expiry.
