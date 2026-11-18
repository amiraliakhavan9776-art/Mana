# Local verification, 2026-11-18

Environment: Linux x64, Node v24.22.3. No GPU or model calls. Historical server snapshot tests are distinguished from live server acceptance.

- `node --test tests/*.test.cjs mana-ai/tests/*.test.cjs`: **472 passed, 0 failed, 0 skipped** after installing the repository's pinned Acorn parser dependency. Includes original typed dependency and recovery/control cases, existing runtime regressions, 9 integration/HTTP tests and 9 validator tests.
- `git diff --check`: passed.
- Source evidence regenerated for the changed tracked source; legacy lexical summary unchanged.
- `node mana-ai/development-acceptance.cjs`: **NOT PASSED**. Actual HTTP route reached the real bwrap runner, which failed closed with `Failed to create NETLINK_ROUTE socket: Operation not permitted`. No fallback or sandbox pass claimed.
- Browser desktop/mobile click check: **NOT PASSED locally**. Chromium cannot create its singleton socket in this execution environment (`socket() failed: Operation not permitted`). HTTP tests do not replace browser acceptance.
- New CI jobs separately require actual sandbox acceptance and desktop/mobile UI clicks. The browser-only job uses an explicitly injected test runner; it is not real sandbox evidence. CI for the final commit must be checked independently.
- Independent review found missing durable unknown-result marker; corrected with a fsynced pending file and directory before invoking the process, plus restart/no-replay regression. Source-change and lost-result paths now block subsequent execution until manual reconciliation.

No current-server diff, server install, deployment, merge, public authentication/TLS acceptance, full-product completion or autonomous code-generation quality is asserted.
