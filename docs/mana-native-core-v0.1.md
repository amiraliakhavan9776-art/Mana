# MANA native planning module v0.1

Status: tested isolated prototype on the PR branch. Not a complete MANA intelligence engine, not production-deployed, and not a replacement for the separately reported Ubuntu Core v5 lineage.

## Scope and source
This increment follows the core/agent foundation and evidence-based decision requirements in MANA_Master_Capability_Register_v1.1.md (2026-10-25), and sections 2, 3, 5 and 14 of MANA_AI_Jarvis_Development_Master.pdf (reconstructed requirements, not an implementation report).
The two source documents were read for this change. The roadmap mapping is in [master implementation map](mana-master-implementation-map.md).

## Runnable result
From repository root:
```sh
node mana-ai/native-core-demo.cjs
```
Or from mana-ai: `npm run native-demo`.
The synthetic demo chooses an inspect -> draft chain costing 5 work units over a 9-unit alternative, produces dependent WBS tasks, and rejects a cheaper option that violates a mandatory quality threshold.
It needs Node and the repository, no inference provider, API key, GPU or network. This demonstrates the module's offline computation, not full offline deployment of MANA.

## Implemented components
| Capability | Code | Boundary |
| --- | --- | --- |
| Structured goal planning | src/native/core.cjs plan | Minimum-work monotonic symbolic plan over configured operators and explicit grants |
| WBS proposal | plan.steps / plan.wbs | Task dependencies, work units and approval gates; no dates, staffing or executed tasks inferred |
| Evidence reconciliation | scoped ledger in core.cjs | Conflicting verified claims block planning; unverified/foreign evidence cannot supply facts |
| Decision evaluation | core.cjs evaluate | Weighted normalized criteria, exact evidence binding, hard vetoes and tie abstention |
| Private decision memory | src/native/decision-memory.cjs | Consent, encrypted restart persistence, owner/org/project isolation, bounded retention and separate delete grant |
| Language adapter boundary | src/mana-engine.cjs | plan/evaluate use native logic; ask remains an inference adapter |
| History bug fix | mana-engine.cjs | maxTurns:0 now retains no previous chat turns |

These are MANA-maintained algorithms using standard symbolic search and scoring, not a newly trained foundation model or a general intelligence claim.

## Planning contract
createNativeCore receives a trusted capability catalog: id, title, requires, produces, nonnegative integer workUnits, and read/draft/consequential/regulated risk.
Operators describe candidate workflow transitions. They are NOT registered executable tools and their effects are simulated proposals, not verified real-world outcomes.
Input supplies a trusted principal, project, objective label, explicit fact goals, evidence and optional work-unit budget. Natural-language goal decomposition is not implemented.
Capability grants are explicit server-derived principal.capabilityIds. Missing grants yield no operator access. A caller may not inject approved/executed flags or new operators through the request.
Search minimizes the sum of workUnits, not money, elapsed time or risk. Risk gates are preserved regardless of cost. Regulated steps require both approval and professional sign-off.
The search bounds catalog size, fact vocabulary and generated states. SEARCH_LIMIT_REACHED means unresolved within the configured search budget, not proof of infeasibility. No negative/delete effects or parallel resource scheduling are modeled.

## Evidence and decisions
Evidence rows contain id, orgId, projectId, key, boolean/numeric value, source and verification.
Only a trusted ingestion/review boundary may mark a source verified. The kernel checks consistency and scope; it does not independently authenticate documents or make arbitrary source claims true.
Decision criteria specify weight, direction, range and optional mandatory min/max thresholds. Alternative a / criterion cost binds to key a:cost and an identical verified numeric value.
Missing, unrelated, conflicting or out-of-range evidence disqualifies the affected option. Hard thresholds cannot be outweighed by an attractive aggregate score.
Equal rounded scores abstain. The module does not invent preference weights, guarantee the best real-world decision or simulate independent expert agents. This is one building block for Supreme Council, not the full council.

## Memory and identity
createDecisionMemory requires a private directory and managed 32-byte key. Separate grants: native.memory.write, native.memory.read, native.memory.delete.
remember requires consent:true and persists consent attribution with a scoped, nonexecuted native proposal. recall rechecks access; forget clears only the authenticated owner's scope.
Stored proposals remain untrusted history, never authorization or newly verified world facts. Persistence validates scope/status, not cryptographic proof that the proposal originated from the kernel. Same-scope rollback protection still needs independent evidence.
Do not mix enterprise and Jarvis identity namespaces. This module isolates owner/org/project records but does not implement Jarvis identity provisioning or a global knowledge graph.
The legacy ask adapter remains a local prototype; its session labels are not a production authentication boundary. Optional authenticated POST /v1/native/plan and /v1/native/evaluate adapters are available only when a trusted host injects nativeCore and nativeEvidence into createServer. They are disabled by default; start() does not automatically enable them. This is not a public production deployment.

## Verification
162 Node tests pass in the complete local suite:
`node --test --test-reporter=tap tests/*.test.cjs mana-ai/tests/*.test.cjs`.
The planner was additionally checked against an independent exhaustive-subset oracle on 100 generated small cases. Tests cover lower-work dependency selection, no-plan/budget/grant cases, conflicts, bounded-search abstention, vetoes, evidence binding, ties, zero inference calls, consent, memory isolation and restart persistence.
These are synthetic checks, not acceptance on the user's Ubuntu server, a real construction project, all professions, or general reasoning benchmarks.
The four existing Chromium regressions remain separate CI evidence.

## Still required
Natural-language task grounding, executable capability adapters, real outcome verification/replanning, multi-agent independent critique, causal/world models, semantic/skill memory, learning from feedback, self-evolution sandbox benchmarks, voice/CAD/creative integrations and full production acceptance remain separate work.
Consequential execution stays disabled. No code was deployed to the user's Ubuntu server and no main-branch merge or real data migration occurred.

## Optional HTTP adapter

src/native/api.cjs accepts a projectId plus objective/goals/budget for planning, or criteria/alternatives for evaluation. Server authentication, project grants, catalog capability grants and audit are enforced. Native evidence is snapshotted from host configuration; clients cannot submit evidence, a principal, approval flags or a capability catalog. Request bodies are limited to 32 KiB. Audit failure returns 503 without returning a proposal. Capability discovery reports nativeCoreEnabled only when configured. Production rate limiting, identity lifecycle and deployment hardening remain host requirements.
