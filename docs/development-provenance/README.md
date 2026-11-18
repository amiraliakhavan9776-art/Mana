# Source comparison before shared-file integration

Reviewed baseline: GitHub `feature/mana-ai-foundation` commit `09f5ad891e5a3e8bf81f04d7551d1d3fb776a47a`.

Owner-supplied historical artifacts recovered from Library:
- `mana-core-review.tar.gz`, uploaded 2026-11-02, SHA-256 `bc62feefadcefb11f5e03dd5db4856f2798d64461d9184bbcc0dca274f5c8294`.
- `mana-repair-integration.tar.gz`, uploaded 2026-11-03, SHA-256 `233a293b2c5eae09035d07a77e6b611d00faebb8c2ebd185f90d1c0fcc607a58`.
- `mana-master-next.cjs`, `mana-preview.cjs`, and `mana-pilot.cjs`, created 2026-11-18. The new staging UI is adapted from preview's actual Persian layout, command, explanation and history flow. CSV analysis in pilot is deliberately not removed or replaced on any server.

These are historical uploaded snapshots, NOT a current server attestation.
No server files, services, databases, evidence or model were accessed or replaced.

## Shared runtime differences identified BEFORE replacement

`runtime-snapshot.patch` records the complete baseline-to-snapshot diff:
1. Typed output schemas and schema-validation dependency.
2. Output schema and optional per-tool deadline included in adapter fingerprints.
3. Per-tool bounded deadlines, retaining the original mission deadline.
4. Read-only `preview` and shared preparation validation.
5. Typed validation before output acceptance AND unknown-result reconciliation.
6. Existing authorization, recovery, retry budget, audit and replan logic retained.

The two original test files and exact four named cases are retained. Their passage in this checkout does not establish that current server code is identical. No old server evidence is imported as acceptance.

`mission-coordinator.cjs` and `execution-plan.cjs` from the repair archive were inspected but are NOT imported: the first increment does not need an additional plan host, and their core integration dependencies are outside this slice. No competing executor is created.

The recovered 84-mission development queue is preserved as source metadata. Its `sourceStatus` values are historical assertions, not test evidence. Only two explicitly mapped benchmark missions are executable here. All original acceptanceEvidence and review states remain unchanged.

Before any server cutover: obtain a fresh source-only snapshot, compare hashes/diffs of every shared path, retain the server's approved changes, rerun the four original cases plus regressions in separate staging, and review rollback. Do not copy this checkout over the active server tree.

The missing typed-contracts dependency was reconstructed from the recorded validator algorithm, not imported as a byte-identical server file. Added recursion bound and dedicated regression tests are explicit changes. A fresh server comparison remains mandatory.
