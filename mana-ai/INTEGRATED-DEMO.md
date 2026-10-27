# Mana AI — integrated offline demo

This is a **runnable integration smoke demo** for profession profiling → draft plan → explicit approval → local draft outputs. It uses a clearly labeled **mock model** and does not represent real AI reasoning, deployed service, live business automation or production readiness.

Node.js 20+; from repository root:

```sh
node mana-ai/autopilot-demo.cjs mana-ai/examples/business-autopilot.example.json
node mana-ai/autopilot-demo.cjs mana-ai/examples/business-autopilot.example.json --approve-drafts
node --test mana-ai/tests/autopilot-demo.test.cjs mana-ai/tests/autopilot-executor.test.cjs mana-ai/tests/autopilot-orchestrator.test.cjs
```

No external network, credentials or GPU required. Without the approval flag no drafts are generated. With approval, only in-memory generic drafts are generated and audit events collected. No company data, files, contracts, money or systems are modified.

For real local-model **planning only**, see `AUTOPILOT-LOCAL.md`. Actual inference requires a running locally installed model. Future work: secure API/UI integration, server-side identity, persistent approvals and audit, real model benchmark, verified tool execution and operational deployment.
