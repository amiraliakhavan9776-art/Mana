# Mana AI — local model-assisted business autopilot

**Implemented:** draft-only planning orchestrator that accepts a profession profile and requests a structured plan from a locally running OpenAI-compatible model. No external API needed. No business actions are executed.

**Not implemented:** autonomous task execution, CAD orchestration, company-wide setup, model training, GPU installation, production authentication, deployment or human approval UI.

Prerequisites: Node.js 20+, a locally installed and running compatible model server, and a model ID available in that server.

From repository root:

```sh
export MANA_AI_LOCAL_PROVIDER_URL='http://127.0.0.1:1234/'
export MANA_AI_MODEL='<your-local-model-id>'
node mana-ai/autopilot-local.cjs mana-ai/examples/business-autopilot.example.json
node --test mana-ai/tests/autopilot-orchestrator.test.cjs
```

The base URL must be loopback-only. Replace the port/model with the values from your local runtime. The model is instructed to return JSON; if it doesn't comply, the planner fails safely instead of executing anything.

The planner currently recognizes a limited allowlist: strategy brief, brand brief, operations plan, financial review checklist and facade takeoff preparation. All are **proposed** and unexecuted. Inputs should be synthetic until the security and privacy review is complete.

Next: local GPU inference benchmarking, permissioned read-only business data integration, reviewed tool execution, tests and audit.
