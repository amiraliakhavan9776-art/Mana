# Mana AI — canonical delivery gates

Status: proposed acceptance contract; unchecked criteria are NOT completed or approved.
Priority P0 blocks approval of this PR; P1 blocks the named implementation/data gate. Each gate needs an evidence link, source SHA, command/environment where applicable, result, unresolved exceptions and named reviewer approval. Do not infer approval from a green CI run.

## Phase order
| Gate | Deliverable | Required evidence before advancing |
| --- | --- | --- |
| G0 — scope (P0) | Accurate PR scope and one roadmap | Executable prototypes disclosed; owner reviews full scope or chooses to split docs and prototypes; Draft retained until review |
| G1 — inventory (P1) | Complete codebase/workflow/dependency map | Every entry point, override, data collection, write path, integration and unknown mapped to evidence; representative synthetic fixtures and expected business results reviewed |
| G2 — contracts (P1) | Behavioral regression, data recovery and security contracts | Critical workflow tests; backup/restore reconciliation; versioned API/schema; identity/authorization/approval/audit contracts and threat model reviewed |
| G3 — isolated service | Minimal self-hosted skeleton, no production connection | Health/readiness, validated config, secret handling, baseline logs, restricted egress and failure tests; G1/G2 evidence reviewed before extending existing prototypes |
| G4 — read-only pilot | Approved snapshots and grounded answers | Tenant/project/field isolation, no unauthorized egress, provenance, prompt-injection tests, deletion/retention and access revocation; no business writes |
| G5 — controlled writes | One bounded domain workflow | Durable approvals, transactions, optimistic concurrency, idempotency, complete audit, timeout recovery and rollback/compensation drills |
| G6 — domain expansion and production | Strategy, voice, CAD/BIM, profession packs | Per-capability acceptance, licensed sign-off where needed, capacity, operational security, recovery drills and explicit rollout approval |

Authentication, access isolation, audit, monitoring and recovery are incremental prerequisites; they are not deferred to a final hardening phase. Synthetic isolated experiments may continue without implying readiness for real data.

## Authorization and human approval contract
- Canonical principal: actor ID, organization ID, verified memberships, session ID/expiry and server-derived permissions. Current id/orgId/role and userId/organizationId contracts require an explicit adapter and conformance tests.
- Deny by default; evaluate actor × organization × project × resource × action × state. Resolve project membership explicitly; same-organization membership does not automatically imply project access.
- Separate read, draft, propose, approve, execute, administer and audit permissions; default to separation of requester and approver for consequential actions. Limits and exceptions require an owner decision.
- Approval record: unique ID, organization/project/resource scope, exact canonical payload hash, data version, action/tool version, requester, authorized approver, reason, issue/expiry time and lifecycle state.
- States: proposed -> pending -> approved/rejected -> executing -> succeeded/failed/unknown; expiration and cancellation invalidate execution. Changed payload or data version requires reapproval.
- Recheck current permissions, limits, data version and approval expiry at execution. Consume approval atomically with the operation/idempotency key; replay must not repeat the effect.
- A boolean from a caller is not a production approval. High-risk operations remain disabled until this contract is implemented and tested.

## Audit contract
Record event ID, UTC time, actor/service/session, organization/project/resource, action and outcome, request/trace/idempotency/approval IDs, input or version digest, provenance/model/tool versions and redacted change summary.
Never log credentials or raw confidential prompts by default. Access, retention, export and deletion of audit evidence need policy.
A local unkeyed hash chain detects some corruption, not full rewrite or tail truncation. Use an independent append-only sink or externally anchored checkpoints; test concurrency, truncation, disk-full, restart and verifier failure.
For consequential writes, commit required audit evidence transactionally or use a durable outbox with defined reconciliation. If required evidence cannot be durably secured, stop the operation. Operational logs do not replace audit.

## Migration contract
- Decide source of truth, legacy coexistence, cutover/freeze or delta capture, ownership and conflict resolution before moving user data.
- Capture a read-only, versioned export from every relevant device/browser profile; encrypt and verify a restorable backup before transformation.
- Specify mappings for every collection, IDs, relationships, money/currency/rounding, dates, attachments and status provenance.
- Preserve the original legacy approval status as historical data. Missing or auto-seeded approval evidence must not become a verified approval; use an explicitly reviewed unverified state.
- Quarantine malformed/unknown records with an error report. Corrupt storage is not an empty database; never silently substitute demonstration data during migration.
- Dry-run synthetic historical schemas first; reconcile per-collection counts, IDs, relationships and exact monetary totals. Every difference needs an explained and approved mapping.
- Test repeat import, partial failure, concurrent edits and rollback. Once new writes exist, define freeze/replay or compensation; restoring an old backup alone would lose them.
- Current projects/documents snapshot validation is not a full financial-data migration.

## Dependencies and self-hosting
Maintain an inventory of runtime and build dependencies, versions, licenses, checksums, artifact origin, local cache/mirror, upgrade/rollback owner and failure behavior.
Include Node, Python, ASR/TTS packages and models, inference weights/tokenizers, GPU drivers, CAD tools/licenses, OS/container artifacts, DNS/time/certificates, CI actions and storage.
Pin a supported production runtime after validation; current Node 20/22 CI and local Node 24 verification are different evidence.
Core workflows must survive blocked international egress with locally available authentication, inference and required artifacts. Optional external research/inference requires explicit classification and transfer policy; no silent external fallback.
MANA's native core acceptance must evaluate its own planning, memory, policy, evaluation and sandboxed self-evolution separately from model quality. Live self-modification requires explicit approval, benchmarks and rollback.

## Stop rules
Stop advancing the affected gate if:
1. Scope, source SHA or claimed implementation status is inaccurate.
2. Critical workflow tests fail or are missing; an unreviewed exception is not a pass.
3. Unauthorized tenant/project/field access or data transfer is possible.
4. Counts, relationships or money differ without approved explanation.
5. Backup restore, key recovery or post-write rollback cannot be demonstrated.
6. Expired/replayed/changed approvals permit effects, or permission revocation is ignored.
7. Required audit fails, concurrent writes are lost, or retries duplicate effects.
8. Tool timeout leaves an unknown outcome: quarantine and reconcile before retry. Promise timeout/AbortSignal alone does not terminate an uncooperative worker.
9. External connectivity failure breaks a required local workflow.

## Open decisions — no approvals inferred
| Decision | Safe interim behavior | Needed before |
| --- | --- | --- |
| Authoritative datastore and legacy coexistence | Read-only snapshots, preserve originals | Migration/write design |
| Project visibility within an organization | No new broad data access | G4 |
| Approver roles, financial limits, delegation and separation exceptions | Consequential actions disabled | G5 |
| Recovery time/data-loss objectives and key custodian | No production rollout | G6; backup design earlier |
| Proprietary core boundaries and benchmarks | Label provider orchestration as prototype | Claims of native-engine completion |
| Split PR or review combined scope | Keep Draft and block merge | G0 closure |

## Immediate action order
1. Review corrected scope and choose split vs combined review.
2. Complete inventory and implement critical behavioral/browser/financial/restore regressions.
3. Review identity, project access, approval, audit and migration contracts against those workflows.
4. Address implementation gaps in separate reviewed commits; prove each gate before production use.
