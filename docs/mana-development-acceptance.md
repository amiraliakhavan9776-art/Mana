# Current development gate: no server deployment

Owner instruction: server installation paused at 49e42d9; existing services stay active. Continue only GitHub code/testing, preserve one reference runtime, keep PR Draft and require owner approval before merge/deploy. This supersedes earlier suggestions to install test packages.

## This increment

- Runtime adds explicit authorized `replan` for failed completed output, never unknown effects.
- Excludes failed adapters, creates a bounded alternative plan using host evidence plus verified completed-task receipts, preserves completed output dependencies and failed attempt history. At most 3 generations; original deadline remains.
- Retry and replan now consume the original mission work budget, including failed attempts. Replan cannot increase its remaining budget. These are declared work units, not measured monetary cost/CPU usage.
- Jarvis delegates replanning to the SAME runtime and obtains evidence only from the host callback. No request evidence/principal/project override.
- Tests exercise fallback execution after rejection without repeating the successful tool, and cumulative retry budget exhaustion. General test timeout increased from 50ms to 500ms after full-suite contention demonstrated that 50ms could expire correct local filesystem operations; explicit timeout and expired-lease coverage remain.

This does not establish general reasoning, autonomous repair, specialist council, scheduler, AEC design or production readiness. Replanning remains an explicit trusted host operation. Tool verification covers only the adapter's invariant. Reusing outputs requires unchanged fingerprints and current capability grants. Untrusted code, consequential operations and unknown-effect replay remain disabled.

## Three mandatory end-to-end acceptance missions

These gates are OPEN. Synthetic inputs and unit-test fixtures are regression evidence only and do not satisfy them.

| Mission | Required genuine input | Inspectable output and checks | Current blocker |
|---|---|---|---|
| Architecture design + editable drawing + takeoff | Owner-authorized site survey/dimensions, design brief, jurisdiction/source constraints, scope and units | Open/reopen editable drawing in supported CAD/BIM tooling; geometry/dimensions/element IDs; source-linked quantities independently checked; signed specialist review where required | Actual project input, licensed/available CAD/BIM tools and validation integration not supplied; no general design pipeline implemented |
| Project financial audit | Authorized source invoices/claims/contracts/payments, dates/currency and accounting scope | Source-linked exceptions/reconciliation, exact deterministic amounts, distinguish missing evidence from fraud, reviewable report and tables | Actual documents absent; complete audit adapters and report pipeline not implemented |
| Jarvis multi-tool mission | Authorized personal task with permitted files/connectors and consent boundaries | Shared-runtime plan/progress, multiple real tools, persistent recovery and artifact verification; no sending/commitment without explicit permission | Personal facade exists; general conversational grounding, voice and account connectors are incomplete |

No claim that these three missions passed. No new server-upload archive or installation command in this increment. Existing inventory report remains a narrow local integration check, not acceptance of these product missions.

## Dependency order

1. Harden shared execution/recovery/receipts and independent evaluation.
2. Implement source-pinned document and exact-unit computation adapters, actual artifact validation and authenticated progress projection.
3. Run the three missions using authorized real input in isolated staging/workspace; capture provenance and independent quality checks.
4. Add conversational/voice grounding, research/router/council and industry packs behind contracts with measurable acceptance. Do not make independent duplicate engines.
5. Server-source adapter review, production identity/audit/sandbox/restore/migration gates, then owner review before deployment.

Render limits: no GPU/renderer availability demonstrated here. No rendering, image/video/music synthesis or DWG/Revit export capability claimed without the actual supported engines/providers and successfully reopened artifacts. Language/multimodal interpretation still requires suitable models; deterministic planner/replan/memory controls remain model-independent.
