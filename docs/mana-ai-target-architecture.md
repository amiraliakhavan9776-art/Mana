# Mana AI target architecture and security gates

Status: approved product direction, **not implemented end-to-end**.

## Product goal
A general-purpose, profession-agnostic company operating system with an AI orchestrator, multiple replaceable models, controlled tool agents, internal knowledge retrieval, public research, strategy generation, voice, design/engineering integrations, and auditable business workflows. Construction is the first deployment, not a limitation.

## Execution lifecycle
1. Identify user, organization, project, purpose and permissions.
2. Plan and classify the requested operation and data sensitivity.
3. Retrieve only authorized internal context; if insufficient, propose or perform explicitly permitted public research with redacted queries.
4. Select an allowlisted model/tool and impose time, token, cost and request limits.
5. Validate sources, outputs, policy and intended side effects.
6. For consequential operations, obtain specific authorized human approval and any required licensed professional sign-off.
7. Execute through least-privilege connectors, record evidence and audit events, verify outcome and support recovery.

## Non-negotiable security gates
- Tenant isolation at storage, retrieval, tool and model-context boundaries; deny by default.
- Strong identity (SSO/MFA), role- and attribute-based authorization, short-lived credentials, secrets vault and key rotation.
- Encryption in transit and at rest; classified data and explicit outbound-transfer policies.
- Prompt-injection-resistant tool mediation; untrusted documents/webpages are evidence, never authority.
- Sandboxed execution with network/filesystem restrictions, egress allowlists, quotas and emergency kill switches.
- Immutable or externally anchored audit, observability, abuse detection, backups and disaster recovery.
- Human approval for payments, signatures, deletion, permission grants, high-risk changes and safety-critical decisions.
- Independent security reviews, threat modeling, adversarial tests, supply-chain checks and staged rollout.

## Delivery phases
1. Read-only core, validated snapshots, access controls and tests.
2. Scoped research and retrieval with source verification and privacy-preserving search.
3. Persistent encrypted tenant-scoped memory and semantic retrieval.
4. Model router with policy-based provider selection and fallback.
5. Sandboxed tool-agent orchestration, approval workflow and audit.
6. Domain-specific connectors, voice, CAD/BIM, strategy and profession packs.
7. Production readiness: SSO, databases, deployment security, monitoring and disaster recovery.

The current foundation has only partial prototypes of phases 1-2. Do not expose it publicly or connect sensitive production data. Never merge to main without explicit approval.
