# Mana AI — Persian mobile account UI pilot

The `/mobile` interface now has user ID/password login, logout, a conversation ID field and a button to load the current user's stored messages. After login, a user chat message is saved through the scoped conversation API before the existing local model request.

**Important limitations:** This is a development prototype, not production-ready mobile authentication or synchronization. The login route must be explicitly enabled by the host; the standalone CLI does not configure accounts or encrypted storage. Session credentials are kept only in page memory (lost on refresh). The model's answer is **not** persisted, so loaded history currently includes only user messages. The legacy `/api/ask` and voice endpoints are not authenticated. Do not enter confidential business data or expose the server on the network.

Before rollout: authenticated model requests, saving assistant replies, trusted identity management, HTTPS, throttling, verified org membership, conversation ID ownership, CSRF/origin checks, logout/session expiry, retention and multi-device end-to-end tests.

Run static UI test:
```sh
node --test mana-ai/tests/mobile-account-ui.test.cjs
```
