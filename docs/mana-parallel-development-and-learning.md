# Build the engine and train the model as separate verified streams

The owner's instruction is to advance both the master-plan engine and a MANA-trained model, not replace implementation with repeated tiny-model training. This increment adds executable hierarchical planning to the reference mission runtime, and an explicit reviewed-feedback-to-training contract. Neither closes G1/G2, grants production approval, establishes general coding competence, or starts unattended work after a conversation ends.

## Engine stream: ordered hierarchical tasks

`native/hierarchical-planner.cjs` adds trusted host-defined methods that decompose compound tasks into nested tasks and primitive capability IDs. The host supplies methods; a request supplies only known task IDs, goals and scoped evidence. Cycles, unknown tasks, ambiguous primitive/compound names, empty methods, hierarchy depth and search-budget exhaustion stop. Methods may require positive verified facts; foreign or unverified evidence cannot satisfy them, and canonical evidence conflicts block the proposal.

Search enumerates bounded acyclic ordered methods, checks primitive grants and preconditions, and chooses the lowest work-unit complete plan among those enumerated. It does not infer tasks from natural language, plan negative/delete effects, schedule parallel resources or optimize elapsed time/money. Explicit ordering preserves obligatory review steps even when a flat goal planner could omit them. Proposed effects remain simulated until independently verified tool execution. Approval and professional-signoff flags survive decomposition.

`createMissionRuntime({hierarchicalMethods,...})` accepts optional `tasks` in `create`. It remains the sole executor and encrypted state owner; no parallel runtime is introduced. Hierarchical create requests bind the method configuration digest into idempotency identity. Existing symbolic create behavior remains unchanged. Leaf tools still undergo the runtime's current identity/grants, input/dependency/output, budget, timeout and unknown-outcome checks. Ordered dependencies can include a preceding step beyond fact producers, so installed adapters must validate that dependency shape. Hierarchical replanning stops pending a method-preserving recovery contract; it cannot silently fall back to a flat plan that bypasses required phases. Existing symbolic replanning is unaffected.

Real executable document workflow:

```
node mana-ai/mission-document-run.cjs /absolute/inventory.json /absolute/private-workspace --hierarchical
```

This decomposes delivery → assessment/report and assessment → inspect/analyze, then executes the same three pinned document adapters and creates a checked Markdown report. Restart uses the encrypted mission and verified receipt; no legacy executor or model service is called.

## Learning stream: reviewed feedback is a dataset candidate

`native/training-feedback.cjs` exports request/code corrections only when the principal has project access, the explicit `native.training.export` capability, a current host authorization and a host verifier that confirms exact payload digest plus consent, rights, privacy clearance and authorized independent review. Requester and reviewer must differ. Caller booleans, model self-ratings or the existence of review IDs cannot authorize export. Mixed-scope records, incomplete provenance, duplicate IDs, self-review and exact cross-family answer leakage stop the entire batch.

The host callback is an integration boundary, not a deployed consent service. Tests use explicitly synthetic host-authority fixtures. No real user's messages, company data or feedback were exported/trained by this change. The output is bounded JSONL compatible with the from-scratch trainer and a separate provenance manifest. It carries `trained:false`; acceptance does not modify model weights or the active service. Revoked consent stops a new export; prior exported datasets/checkpoints require a separate retention/deletion/retraining policy. Automatic unlearning is not claimed.

The Python training integration test sends authored synthetic records through the actual Node export contract, validates the resulting family split with the real corpus loader and performs real gradient updates into a numeric checkpoint. This verifies the bridge rather than asserting that a user-approved business dataset exists or that the model became a better programmer.

## Priority and independent acceptance

1. Continue source/workflow, identity, audit and recovery acceptance while implementing isolated bounded core capabilities.
2. Collect authorized data with versioned provenance and project/task-family isolation; keep validation/test families separate.
3. Measure functional coding benchmarks independently of generated tests before choosing a larger model architecture or training budget; inspect real hardware first.
4. Develop a verified OS sandbox and method-preserving repair loop for code changes; exact approval, promotion and rollback remain separate.

Delivery evidence for this increment includes nested-method cost/ordering/grants/risk/conflict/cycle/search tests, actual encrypted runtime execution/restart, real two-process hierarchical document CLI, feedback alteration/revocation/scope/leakage tests, finite-difference gradient and exact interrupted-training checks. Passing these bounded tests is not full master-plan acceptance. No live deployment, service restart, merge or model promotion is performed.
