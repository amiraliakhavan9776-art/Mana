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

## Subsequent CI evidence

On head `1cc1465dba89481ccd99cd4ad6c94d2ec86ca78a`:
- Real HTTP → bubblewrap → native regression execution → persisted restart **passed**: 4 tests, 2 missions. [Exact commit checks](https://github.com/amiraliakhavan9776-art/Mana/commit/1cc1465dba89481ccd99cd4ad6c94d2ec86ca78a/checks).
- Desktop/mobile browser UI click checks **passed with the explicitly injected runner**. This is separate from the real HTTP/sandbox run; a browser-click-to-real-sandbox E2E test is not claimed.
- Node and artifact checks passed. Baseline source inventory needed regeneration after changing the CI workflow; the following evidence-only revision regenerates it.

CI uses a fresh root-owned source copy only to allow traversal after bubblewrap drops capabilities; it does not disable AppArmor, weaken production security, or change the server.
