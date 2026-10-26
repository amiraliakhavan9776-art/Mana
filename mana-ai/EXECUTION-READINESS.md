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

At source cc614aeb, the existing 102 tests passed on Node v24.22.1 on 2026-10-26. This follow-up adds four passing legacy behavioral tests (106 total). Browser, full migration and production acceptance remain open. See [review evidence](../docs/mana-ai-inventory-and-regression.md) and [canonical gates](../docs/mana-ai-delivery-gates.md). No actual model runtime, GPU, production login system, mobile sync deployment or server provisioning has been completed. Next steps: run tests, fix failures, provision local inference, integrate safe authenticated voice/planning, and test across two devices behind HTTPS/VPN.


## Control hardening follow-up

122 local Node tests now pass. Project access requires explicit trusted projectIds grants; token-only bootstrap has none. Independent audit anchoring and encrypted backup verification are tested interfaces, not provisioned production services. Browser CI is separate and must be checked. See [verification and integration requirements](../docs/mana-ai-control-verification.md). G1/G2 and consequential-action approval remain open.

## Persistent-control implementation

135 Node tests pass. Settlement calculation was corrected after reproducing its failure. Persistent approval storage and a configured encrypted audit-checkpoint adapter are implemented; neither activates business effects or provisions independent production infrastructure. See [persistent controls](../docs/mana-ai-persistent-controls.md) and the latest browser workflow before release.
