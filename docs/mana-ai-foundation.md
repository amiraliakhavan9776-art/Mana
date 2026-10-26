# Mana AI — Foundation and delivery contract

Status: draft architecture under review. This PR contains documentation, executable prototypes, UI/API code, persistence, voice adapters and tests. It is not documentation-only and is not production-ready. Keep it Draft; do not merge without explicit owner review.

## Authority and scope
[Delivery gates](mana-ai-delivery-gates.md) is the canonical phase order and acceptance contract. [Target architecture](mana-ai-target-architecture.md) describes the target, not completed features. [Inventory and regression evidence](mana-ai-inventory-and-regression.md) records observations and remaining coverage. Older pilot documents describe individual experiments and do not override these gates.

The legacy Persian RTL application remains in index.html. Preserve its behavior and stored data while inventory and regression work proceeds. Existing prototypes are not evidence that earlier gates were satisfied retroactively. Pause expansion of the backend until G1 and G2 have reviewable evidence.

## Architecture
Start with a modular application backend in one deployable unit, plus separate inference and restricted tool workers where isolation requires it. This is a proposed implementation default, not a claim about existing deployment.
- Clients: existing browser application, desktop and mobile adapters. Clients never enforce the final authorization decision.
- API/identity/policy: one server-verified identity contract; versioned APIs; tenant and project authorization; approval lifecycle.
- Domain modules: contracts, claims, costs, schedules and profession packs own their rules and write through explicit service contracts.
- Persistence: versioned schema, transactional writes, concurrency control and migration ledger. Source of truth and legacy coexistence remain decisions to resolve before migration.
- MANA intelligence core: MANA-owned planning, reasoning workflow, memory policy, evaluation and governed self-improvement; replaceable inference providers are adapters. Local hosting or a provider wrapper alone does not establish a proprietary reasoning engine.
- Tool execution: allowlisted capabilities, restricted workers, bounded resources, independently enforced permissions and approved effects.
- Evidence: provenance, audit, operational monitoring and recovery.

Construction is the first profession pack. Strategy Architect and the core must remain profession-agnostic. CAD/BIM output requires editable-artifact verification and professional sign-off.

## Delivery rules
Follow G0–G6 in the delivery contract. Authorization, isolation, minimum audit and secrets management precede real data access. Durable approval, idempotency and tested recovery precede consequential writes. Observability and security grow from the first service phase.
No production data, deployments, irreversible actions or merges are authorized by the existence of this document.
