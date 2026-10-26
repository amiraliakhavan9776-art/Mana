# Audited native service boundary

`createAuditedNativeServices({experience, recovery, audit})` wraps the existing
mission-experience and project-recovery services. Host integrations should expose
this boundary instead of the unwrapped instances. The wrapper preserves each
service's current project authorization, consent and evidence checks.

An optional `review` service adds audited `request`, `decide`, and `current`
methods for independent recovery review. Review requests and decisions are
treated as state mutations for unresolved-completion reporting; current-review
receipts are read-only. See `mana-recovery-review.md` for the separate permissions.

An optional `scenarios` service exposes audited read-only `scenarios.compare`.
See `mana-recovery-scenarios.md` for comparison metrics and limitations.

An optional `sensitivity` service exposes audited read-only `sensitivity.analyze`.
See `mana-schedule-sensitivity.md` for precedence and resource-delay limitations.

An optional `budgeting` service exposes audited read-only `budgeting.compare`.
See `mana-scenario-budget.md` for exact arithmetic, cost basis and explicit units.

An optional `budgetRanges` service exposes audited read-only `budgetRanges.analyze`.
See `mana-budget-range.md` for conditional rate-bound affordability and exclusions.

Methods are asynchronous. The caller must await the result. The boundary captures
a private JSON snapshot before waiting for the audit sink, then records an intent
with an operation identifier and exact input digest. It invokes the service only
after the sink acknowledges the intent. Before releasing a result, it records a
completion receipt with the same operation identifier and the result digest.
Audit records contain bounded metadata and hashes, not prompts, observations,
consent references or result contents. Metadata and hashes remain private data.

Use the existing durable chained audit log with its separately protected anchor
for persistence. A memory-only sink or an asynchronous callback that acknowledges
before durable storage does not provide durable evidence. The wrapper requires a
sink but cannot certify the host's durability implementation or identity system.

Failure semantics:

- `AUDIT_INTENT_UNAVAILABLE`: the service was not invoked.
- `AUDIT_COMPLETION_UNCONFIRMED`: the result is withheld. For memory writes or
  deletion, state may already have changed. Reconcile before retrying.
- `AUDIT_FAILURE_UNCONFIRMED`: recording a service failure also failed. Preserve
  the operation identifier for investigation. Do not infer rollback from a
  failed API response.
- A recorded `operation_failed` event reports an exception, not a transaction
  rollback guarantee. The underlying state service remains responsible for its
  own durability and failure semantics.

Intent, service storage and completion span separate stores. This is deliberately
not described as atomic distributed commit or exactly-once execution. An intent
without completion is unresolved, not proof of success or failure. The facade
never retries automatically, applies a schedule, trains a model or deploys code.

Tests cover unavailable synchronous/asynchronous sinks, withheld results,
possible committed writes, mutation of caller input while awaiting the sink,
actual mission-runtime-to-memory use, actual monitor-to-recovery use, denied
access, and durable audit restart with an independent protected anchor. Test
consent/evidence authorities are authored fixtures, not production identity.
