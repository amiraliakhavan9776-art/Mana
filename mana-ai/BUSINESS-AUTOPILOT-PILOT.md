# Mana Business Autopilot — runnable offline pilot

This prototype produces an editable-to-extend JSON **proposal** for a profession and organization. It does not start agents, change software, connect databases or execute business actions. It requires Node 20+ and no external AI service.

From the repository root:

```sh
node mana-ai/src/business-autopilot.cjs mana-ai/examples/business-autopilot.example.json
node --test mana-ai/tests/business-autopilot.test.cjs
```

Supported illustrative mappings: construction/architecture, retail and clinic; other professions receive a generic blueprint. The model-based adaptive interview, workflow generation, permissioned task execution and live integrations are **future work**.

The output explicitly disables all proposed agents and external data transfer until authorized. No sensitive records should be supplied to this prototype.
