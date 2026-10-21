# Mana AI — authenticated conversation API foundation

`src/conversation-api.cjs` provides a request handler for:

- `GET /api/conversations/:conversationId` — read messages from the injected conversation store.
- `POST /api/conversations/:conversationId` — append a **user** message, requiring a server-verified principal, write permission and CSRF proof.

The identity is supplied by an injected trusted `authenticate(req)` implementation, not by client-supplied organization/user IDs. The handler scopes storage to that identity and rejects unauthorized writes. It does **not** implement login or token issuance.

**Not yet integrated:** The handler is not mounted in `local-chat-ui.cjs`; the mobile UI does not call it. It requires the encrypted store and a real identity provider to be supplied by a secure host application. It does not create or list conversation IDs; those must be assigned and authorized by the host. No claim of working cross-device sync.

Tests:
```sh
node --test mana-ai/tests/conversation-api.test.cjs
```

Production work: secure authentication and organization membership, authorization of conversation IDs, HTTPS, rate limiting, logging with privacy safeguards, CSRF tokens, encryption key management, storage quotas and multi-process locking. Never mount this API with a placeholder authenticator that trusts user-provided headers.
