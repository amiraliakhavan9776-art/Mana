# Mana Autopilot — controlled execution pilot

Implemented: a small, **in-memory draft generator** that accepts a previously validated autopilot plan, a permissioned principal with `autopilot:draft`, and an explicit approval boolean. It emits a generic draft checklist and an audit callback. No filesystem, company records, finance or network actions occur.

It is not yet a production execution engine: permissions are caller-supplied, audit is callback-only, deduplication is session-only, and no authenticated API or persistent storage is wired in. Do not use with sensitive data.

Test:
```sh
node --test mana-ai/tests/autopilot-orchestrator.test.cjs mana-ai/tests/autopilot-executor.test.cjs
```

Next steps: enforce principal identity server-side, persistent authorization and audit, approved read-only connectors, idempotent task queues, controlled tool adapters and rollback procedures; only then permit real operations. Facade engineering remains a separate review-gated workflow.
