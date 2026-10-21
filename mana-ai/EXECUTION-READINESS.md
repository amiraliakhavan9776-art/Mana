# Mana AI execution readiness

New automated test: `node --test mana-ai/tests/persistent-chat.test.cjs` covers authenticated conversation persistence, context reuse, and rejection of unauthenticated requests.

Security adjustments in local chat server:
- Login attempts are throttled after five failed attempts per user ID within a process (60-second cooldown). This is **not** sufficient for public deployment; add network-wide/IP controls and distributed rate limiting.
- Model responses on persistent chat are limited to 4,000 characters to match the current encrypted store.
- When session authentication is configured, legacy unauthenticated `/api/ask` and voice endpoints are disabled. As a result, business planning and voice features are not available in this authenticated pilot until migrated to protected routes.

Run:
```sh
node --test mana-ai/tests/*.test.cjs
```

Tests have been committed but not verified as passing. No actual model runtime, GPU, production login system, mobile sync deployment or server provisioning has been completed. Next steps: run tests, fix failures, provision local inference, integrate safe authenticated voice/planning, and test across two devices behind HTTPS/VPN.
