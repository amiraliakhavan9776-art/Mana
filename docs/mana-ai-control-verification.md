# MANA control verification follow-up

Date: 2026-10-26. Parent revision: 08b4b0490a6c790807ba5a3508cd4b66c0a61826.
This change hardens existing read-only prototypes and adds isolated migration verification. It does not enable business writes, live migration, production deployment or self-modification.

## Implemented and locally verified
- 122 Node tests pass (0 failed, 0 skipped) using Node v24.22.1:
  `node --test --test-reporter=tap tests/*.test.cjs mana-ai/tests/*.test.cjs`.
- Explicit server-configured projectIds grants now constrain project lists, metadata, retrieval, document tools, AI HTTP prechecks and conversation memory access. Missing grants mean no project access, including for admins. Cross-organization checks still apply even if a foreign project ID is granted.
- normalizePrincipals copies/freezes configured grants and rejects malformed/duplicate IDs. Agent execution passes grants without exposing tokens.
- Synthetic tests cover same-organization denial, cross-organization denial, immutable grants and refusing previously stored memory when the supplied principal no longer has access.
- Existing financial calculation regressions cover deductions, VAT base, explicit zero rates and Persian/Arabic numeric payments.
- Audit writers use exclusive lock files; startup failures release locks. Canonical parent paths reduce alias lock bypass. Optional synchronous independent checkpoint callbacks detect tail truncation/rewrite at restart; append/anchor failure poisons the writer. Event IDs and correlation metadata survive restart.
- HTTP audit failure returns 503 and health remains available; protected project information is not returned on the tested path.
- AES-256-GCM backup verifier restores exact raw JSON and explicit IndexedDB attachment records, rejects authentication/key/corruption failures, duplicate records and orphan project/contract references. It preserves unknown array collections and reports missing/system-generated invoice approval evidence without promoting statuses.

## Operator and integration requirements
1. Trusted host configuration must explicitly supply grants, e.g. `{id:'u',orgId:'org',role:'viewer',token:secret,projectIds:['p1']}` to createServer. Client request bodies cannot set grants. The token-only bootstrap admin now has no project grants. No wildcard/automatic project grants were added.
2. Existing prototype identities remain static configuration snapshots. Production needs a canonical identity adapter, session revocation and a current policy store; these tests do not prove real-time IdP revocation.
3. The audit anchor must be stored outside the log writer's trust boundary. No production anchor service has been provisioned. Unanchored mode is still a development log and cannot prove full rewrite/truncation resistance.
4. Anchor callbacks are synchronous and must durably commit or throw. A crash between log and anchor writes intentionally blocks restart pending reconciliation. Stale .lock files after a crash require verified operator recovery; do not automatically delete locks or checkpoints. Parent directories must be operator-controlled and not writable by untrusted processes.
5. Backup requires the caller to enumerate ALL devices/profiles, mana.db.v2 and mana-attach/files records. Empty attachments must be an explicit export, not inferred completeness. Keep backup keys in managed secrets and verify separate recovery access.
6. The backup verifier is an isolated library, not a UI import replacement or centralized migration. It cannot prove that a supplied attachment export is complete, validate every domain relationship, perform schema conversion or prevent concurrent legacy writes. No live storage is touched.
7. High-risk actions remain disabled. A durable, payload/version-bound approval system, transaction/idempotency design and compensation remain G5 work.

## Inventory progress
Run `node tools/inventory-legacy.cjs > docs/generated/legacy-static-index.json`.
The static index covers 32 script blocks, 149 named function declarations, 190 handler registrations, 66 handler assignments/overrides, 51 literal route registrations, 14 renderer assignments, 706 DB property references and 26 storage operations.
It records line numbers and repeated names, not effective lexical scope. The 100 generic k-property matches include non-route configuration. Do not treat those as 100 application routes.
IndexedDB attachments use mana-attach, version 1, files store, id key and ownerKey index (index.html:3005 onward). Existing JSON export serializes DB, not the separate files store.
The final-settlement function-shadowing defect identified at index.html:5580 was reproduced and corrected in the subsequent [persistent-controls follow-up](mana-ai-persistent-controls.md). The regenerated static index describes the corrected source.

## Browser regression
Two isolated Chromium tests were added:
- Create/edit a project through real UI controls, reload persisted data and visit principal business pages.
- Exercise real legacy approval handlers with synthetic records and verify persisted reversal.
Pinned dependency: playwright 1.62.1 under tests/browser/package.json, isolated from the application. A dedicated GitHub workflow installs Chromium and runs these tests.
Local browser installation failed because the downloaded archive was invalid/truncated. Browser tests are not included in the 122-test local result; use actual workflow evidence before claiming a browser pass.
Reproduce with:
```sh
npm install --prefix tests/browser --ignore-scripts --no-package-lock
node tests/browser/node_modules/playwright/cli.js install --with-deps chromium
node --test tests/browser/*.test.cjs
```

## Gate status
G1 remains open for field-level schema, dynamic keys, effective override ownership and complete workflow mapping.
G2 remains open for browser execution evidence, all claim modes/financial edge cases, full historical migration and recovery objectives.
The new controls reduce specific gaps; they do not establish full production security, offline inference, CAD/BIM acceptance or approval readiness.

## Subsequent implementation

[Persistent controls](mana-ai-persistent-controls.md) adds an encrypted approval lifecycle, a persistent audit-checkpoint adapter wired to startup configuration, settlement correction and expanded browser backup coverage. Historical counts above remain scoped to their parent revision; the latest local suite has 135 passing tests. No live migration or production activation is claimed.
