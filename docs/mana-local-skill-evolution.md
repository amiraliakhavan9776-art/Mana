# Local bounded skill evolution

## Natural-language code authoring

`node mana-ai/code-local.cjs /absolute/request.json /absolute/project /absolute/private-review-workspace` now asks an explicitly host-configured local provider for actual source files from the operator's natural-language request. `examples/code-request.json` demonstrates a Persian request. The host explicitly lists at most ten editable paths; only those source files are sent as context (80 KiB maximum), and generated output cannot select another path. Missing listed files may be created. Symlinks, traversal, hidden files and dependencies/data/secrets directories are refused. Existing project content is rechecked after generation; stale proposals stop. Original project files never change.

Real proposed `.cjs`, `.py`, `.ts`, HTML and other allowed files are written under a separate private `candidate/` directory, with old/new hashes and a request-bound receipt. Provider absence returns a dependency result without creating a completed draft. A coding model's proposed tests are review material, not independent acceptance evidence. This step stops at `CODE_DRAFT_AWAITING_SANDBOX`, explicitly `testsExecuted:false` and `sandboxVerified:false`: arbitrary generated programs are NOT executed by the host. This is genuine code-file authoring infrastructure, but real model quality has not been measured here, and autonomous implementation/test/repair of arbitrary repositories is still unfinished. The bounded expression loop below supplies executable verification only for its restricted skills.

This increment provides an executable candidate loop, not an autonomous general software engineer. It does not complete the master plan, change live code, install a model, or promote a passing skill into the active runtime. G1/G2 and production acceptance remain open.

The operator supplies a private workspace and a trusted task with an instruction, field allowlist and at least three independent expected-result tests. The loop asks a loopback-only local language provider on an explicitly supplied loopback port for a JSON expression, validates its grammar, evaluates it against host tests, and saves immutable candidate receipts. Failed attempts receive only generic failure feedback; expected outputs and test inputs are not transmitted to the model. Passing candidates stop at `BENCHMARK_PASSED_AWAITING_REVIEW`, always with `approved:false` and `productionDeploymentAllowed:false`. There is no promotion, deploy, patch-application, arbitrary shell, JavaScript, import, network or filesystem operation in the expression language.

The optional model must already be available locally. Provider failure returns `DEPENDENCY_UNAVAILABLE` without consuming a generation attempt; it never substitutes a mock success or calls an external provider. Each task has at most three attempts in the CLI, a hard library maximum of five, and each provider request has a two-minute deadline and bounded response. The backlog CLI validates up to ten operator-authored tasks before starting and processes them serially, stopping on provider absence. These sample tasks cover display/count helpers only; they are not independent proof of broad intelligence.

## Run offline mechanism verification

`node mana-ai/evolution-check.cjs`

This uses an explicitly synthetic generator to prove failed-candidate rejection, successful benchmark storage and restart reuse. It does NOT test a real model or claim a new learned capability.

## Run actual local generation

From the extracted release directory, with its Node 24 on PATH:

```
node mana-ai/evolve-local.cjs "$PWD/mana-ai/examples/skill.clamp-percent.json" /opt/mana-engine-lab/evolution-state
node mana-ai/evolve-backlog.cjs "$PWD/mana-ai/examples/evolution-backlog" /opt/mana-engine-lab/evolution-state
```

No model process is started by these commands. A pre-existing compatible local provider and weights are required; its availability has NOT been established by the archive or local fake-provider tests. The archive's earlier provider modules are not imported or executed. Native coding entry points now require explicit `MANA_CODER_PORT` and `MANA_CODER_MODEL`; there is no implicit Gemma endpoint. Requests use standard chat messages with the host-selected model; provider-specific model aliases/authentication may require a reviewed adapter. Only the task instruction/field names and generic feedback leave the loop, over loopback. Do not put confidential business data in task instructions.

## Deterministic grammar and restart contract

Expressions have only `{value:...}`, `{field:...}` or `{op:...,args:[...]}` nodes. Allowed operations are add, subtract, multiply, divide, min, max, less, equal and lazy if. Maximum 128 nodes, depth 12, sixteen named fields and absolute finite numeric bound 10^12. Types, missing/extra inputs, zero division, unknown operations and unexpected expression keys fail closed. Arithmetic uses ordinary JavaScript numbers and MUST NOT replace the exact monetary calculator or safety-critical engineering computations. Strict JSON parsing rejects duplicate keys and noninteger numeric source literals; runtime arithmetic may produce fractions. Contracts needing decimal literals should use a separately reviewed version, not implicit parser relaxation.

Checkpoint directories bind task ID, instructions, field/test contents and current interpreter/evolution/parser source fingerprint. Writes use exclusive temporary files, fsync and link-without-overwrite; a process lock rejects concurrent same-task workers. Completed candidates are revalidated and rebenchmarked on restart, including their digest; failed attempts remain evidence and count against the budget. This is protected local operator storage, not an independently anchored audit sink or defense against a malicious workspace owner.

A hard interruption may leave a `lock` directory. The tool stops rather than guessing that the worker is dead. Confirm no worker is running and preserve the task directory before removing that empty lock manually. A provider call interrupted before a receipt may run again; there is no live effect to duplicate. A newly completed task cannot close a whole feature or approve itself. Source fingerprints change after engine updates, requiring new evaluation.

## Verification and limits

Tests exercise independent fixtures, malformed and duplicate JSON, attempted JavaScript injection without execution, depth/types/numeric boundaries, failed-to-passing repair, restart and altered evidence, provider absence/resume, task changes, private workspace, concurrent workers, and actual loopback HTTP responses, redirects, size and deadline failure. No system sandbox is claimed: generated programs never execute. Bubblewrap was detected in the development host but failed its namespace preflight, so it is not used as a substitute for isolation.

Still required for general self-development: operating-system sandbox acceptance, trusted repository edits and independent regression benchmarks, dependency/tool contracts, promotion approvals bound to exact changes, rollback/recovery and integration into the shared mission runtime with actual host identity. The present local CLI is an operator research tool and has no public authentication API. Neither it nor generated candidates own a competing business mission runtime.


The subsequent Python pure-function OS benchmark/repair prototype is documented in `mana-python-code-repair.md`. Its actual acceptance is separate from unit tests; the general repository edit/build/test sandbox remains unfinished.
