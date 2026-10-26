# Persistent controls and settlement correction

Date: 2026-10-26. Parent: f2e5ac3930dbcffe5f0d7ddc41efaa2e7cbcd8c2.
This implementation is on the PR branch; it has not been approved for production deployment. Main and real user data have not been changed.

## Settlement defect corrected
The final-settlement module's local variable invoicePaid shadowed the payment calculation function. A project with any invoice triggered TypeError: invoicePaid is not a function.
A regression reproduced the failure before the fix. The local aggregate is now paidInvoicesTotal; the public result field invoicePaid and calculation formulas are preserved.
The regression verifies gross 2000, paid 600, retention 100 and receivable 9300 for a synthetic contract of 10000.
The source index.html has changed in this follow-up; prior unchanged-source claims apply only to earlier revisions. New Git blob: abaee494c42c6e9dcb84996bb2aedfe67a1861ba. SHA-256: a966113bebe75b44000ab11ff87df25ffe2bbbe5ff54302a2dab784c789168f2. Generated static index was regenerated.

## Durable approval lifecycle
Module: mana-ai/src/approval-store.cjs; storage primitive: encrypted-state.cjs.
API: request, decide, cancel, claim and finish.
- Exact action, organization/project/resource, data version, tool version and canonical payload digest bind the approval.
- Explicit expiry, separate requester/approver, reason and current authorization are required. The host must supply authorize; no role or financial limit is invented by the module.
- Claim revalidates both executor and original approver against current policy. Changed payload/destination/version, rejection, cancellation, expiry and replay are denied.
- Claim durably records executing before returning. A crash or unknown effect must be reconciled; the same approval must never be automatically replayed.
- Idempotency keys are unique across claimed records in the same organization. Domain adapters must also enforce business-operation idempotency transactionally; a file claim alone cannot make an external payment atomic.
- AES-256-GCM encrypted state, independent nonces, exclusive writer locks, atomic rename and file/directory fsync preserve state across restarts.
- Approval content is a digest, not a substitute for the original business proposal. A host approval UI must display the exact original proposal, verify its canonical digest and show the intended effect before calling decide.
- The trusted authorize callback receives operation request/approve/cancel/execute/revalidate-approver and a scoped record. It must resolve current memberships and limits server-side. Revalidation receives the recorded approver ID and organization; it must fetch current policy rather than assume a role.
- This module is not mounted as a public approval endpoint and is not connected to payment/signature/delete tools. Governance still blocks consequential actions.

## Persistent audit checkpoint integration
Module: file-audit-anchor.cjs, connected in server.cjs startup through:
- MANA_AI_AUDIT_FILE: absolute log path.
- MANA_AI_AUDIT_ANCHOR_FILE: absolute encrypted checkpoint path in a separate protected directory.
- MANA_AI_AUDIT_KEY_FILE: absolute regular, non-symlink 32-byte raw key file, permissions 0600 or stricter.
All three are required together when checkpoint configuration is supplied.
The adapter authenticates checkpoint ciphertext and audit identity, requires sequential checkpoint advancement, and persists atomically with fsync. Restart verifies the checkpoint against the log head. Invalid keys, corruption, truncation and wrong audit identity stop opening the log.
Startup validation failures release audit locks. Bind failures also close the writer.

A different directory is not an independent security authority. Production must place checkpoint storage and key management under an independently controlled service/mount or use a separate remote append-only witness. No such infrastructure was provisioned here.
If the process crashes between log and checkpoint commits, or leaves a lock file, reconcile against trusted evidence before recovery. Never automatically delete checkpoints or reset a mismatched chain. File rollback by an attacker with access to both evidence and keys remains outside this single-host pilot's guarantees.

## Migration / backup verification
The encrypted backup module retains raw legacy JSON and separately exported IndexedDB attachments. It does not invoke legacy loadDB on corrupt input, seed demonstration data or promote historical approvals.
New browser coverage exercises actual mana-attach/files records, encrypts/verifies the export in Node and restores the synthetic record back into IndexedDB. This is a controlled test, not a deployed import UI or complete migration engine.
Production migration still requires source-of-truth/coexistence policy, all device exports, complete attachment enumeration, historical schema mappings, domain reconciliation and approved recovery objectives.

## Verification
135 local Node tests pass, zero failures/skips:
`node --test --test-reporter=tap tests/*.test.cjs mana-ai/tests/*.test.cjs`.
Coverage includes reproduced settlement failure, approval restart/replay/expiry/revocation/cancellation/binding tests, encrypted state tampering/locking, persistent audit identity/checkpoint tests and failed-startup lock cleanup.
The separate Chromium suite now has four tests, adding settlement rendering and real IndexedDB backup round-trip to the two previously passing browser tests. Consult the latest workflow result before claiming all four pass.

## Remaining release gates
This code can be reviewed and exercised with synthetic data. Full semantic inventory, all financial claim modes, production identity/approval UI, transaction/outbox integration, independently provisioned audit evidence and live migration acceptance remain open. No production readiness is inferred from these selected tests.
