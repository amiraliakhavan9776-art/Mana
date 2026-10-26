# Mana AI target architecture and security boundaries

Status: target product direction; not implemented end-to-end.
Canonical phase order and stop rules: [delivery gates](mana-ai-delivery-gates.md). This document does not define a second roadmap.

## Product goal
A profession-agnostic company operating system with a MANA-owned intelligence core, replaceable inference adapters, controlled tools, retrieval, strategy, voice and engineering integrations. Construction is the first deployment.
Self-hosting and Iran-local offline-capable core operation are requirements, not verified capabilities. See ../mana-ai/specs/self-hosted-independent-ai.md.

## Trust boundaries and ownership
| Boundary | Responsibility |
| --- | --- |
| Client -> API | Trusted server identity, schema validation, rate/size limits, CSRF/session controls |
| API -> domain module | Resource/project authorization and business invariants on every operation |
| Domain -> persistence | Transactions, data version, idempotency and ownership |
| Context -> inference | Minimum authorized fields; untrusted content is evidence, never tool authority |
| Plan -> tool worker | Allowlisted capability, scoped credentials, quotas, isolated filesystem/network and termination |
| Execution -> audit | Durable attributable evidence and independent integrity verification |
| Local -> external | Explicit transfer authorization, redaction, provider policy; no silent fallback |

Default proposed topology: a modular backend deployable as one application, separate inference and restricted workers where isolation is needed. Do not introduce independent domain services before contracts and operational need justify them.

## Execution lifecycle
1. Verify actor, organization, project membership, purpose and data sensitivity.
2. Classify and plan using only authorized context; separate MANA core responsibilities from inference.
3. Select allowlisted tools/models with data-transfer policy and cost/time/resource limits.
4. Validate evidence, outputs, business invariants and intended effects.
5. Bind consequential operations to authorized, unexpired, payload/version-specific approval and professional sign-off where required.
6. Reauthorize and execute idempotently; record durable audit, verify outcome and reconcile unknown results before retry.
7. Recover through tested rollback or compensation.

## Required controls
Deny-by-default tenant/project/field isolation, strong production identity, short-lived credentials, managed secrets, transport/storage encryption, restricted egress, sandboxed tools, kill switches, adversarial tests, dependency integrity and staged rollout.
Do not expose experimental servers publicly or attach sensitive production data. Follow G0–G6; existing prototypes do not establish completion of any gate.
