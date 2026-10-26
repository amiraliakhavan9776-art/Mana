# Executable workflow increment - limited technical acceptance

Scope: keep one `native/mission-runtime.cjs`. Jarvis, structured planner, deterministic technical/risk/budget review, per-tool output validators, bounded fallback/replan and opt-in personal outcome memory now connect through `workflows/execution-cycle.cjs`. This is not a specialist multi-agent council, general deep reasoning or autonomous model-based planning.

## What actually ran

All artifact providers ran real local processes and wrote real files. Inputs were explicitly generated engineering benchmarks, not customer/site/accounting data. No mock tool responses were used to produce the delivered evidence. These runs establish only the narrow capabilities below, not completion of MANA or real-project professional acceptance.

| Workflow | Actual execution and inspectable outputs | Acceptance limit |
|---|---|---|
| Architecture | Persian bounded request -> host proposal -> shared runtime -> ezdxf geometric options -> Decimal floor-area quantities tied to DXF path/layer/hash -> ReportLab PDF booklet. Two editable DXFs reopened and audited; polygon shoelace areas, bounds, non-overlap and quantity links checked independently | Two fixed two-bedroom zoning variants of a rectangle; zero wall thickness, no openings, setbacks, structure, MEP, access-code assessment or real-world design optimization. It is schematic geometry, NOT a construction plan. Quantity scope is floor area only |
| Financial | Text-bearing invoice PDF plus two text payment documents -> pinned-source extraction -> exact integer IRR/IRT normalization -> reconciliation -> actual PDF and XLSX workbook. Formulas recalculate after a disposable input change; XLSX XML/cached difference independently checked | Supported explicit six-field document schema only; no general invoice OCR, legal audit, completeness assurance or live accounting. Benchmark: invoice 10,000,000 IRR; payments 11,000,000 IRR; difference +1,000,000 IRR. Exception is not proof of fraud |
| Jarvis | Persian multi-step geometric request -> three real tools -> persisted checkpoint and separate-process continuation -> new instruction 14x20 instead of 12x20 -> new revision mission, pause/restart/resume -> regenerated DXF/quantities/PDF; explicit-consent personal preference recall and outcome memory | Revision creates a new mission referencing the old mission, preserving previous artifacts; not arbitrary mutation of completed history. Checkpoint recovery here is between tool steps; real SIGKILL during invocation remains covered by runtime tests |

## Persian grounding and providers

`persian-request.cjs` implements a bounded offline grammar for these TWO workflows. It exposes extracted inputs/limitations and abstains on missing dimensions, unsupported requirements, mixed workflows, sensitive actions and unavailable capabilities. It does not implement general Persian comprehension. Natural-language/voice/model providers remain absent. PDF labels are English in this increment.

`external-providers.cjs` begins versioned, host-installed contracts for IFC, rendering, Word, language and speech with mandatory output verification. With no actual provider, it returns DEPENDENCY_UNAVAILABLE and never placeholder success. No IFC, Revit, DWG, photorealistic render, Word file or audio is claimed. No GPU/renderer has been provisioned. Generated code and shell text are not executable inputs.

The XLSX provider requires a host-installed `@oai/artifact-tool` exporter. Its local version was available in this development runtime; it is not bundled or assumed present on servers/GitHub runners. The standard GitHub artifact job verifies DXF/PDF/financial computation; local XLSX execution has separately recorded evidence. The financial report tool refuses validation if the required workbook provider is absent.

## Running code in a development workspace

- Python dependencies: `mana-ai/tools/requirements-artifacts.txt` (pinned tested versions).
- `createArtifactTools` accepts protected absolute output root, explicitly pinned text/PDF sources and an optional trusted workbook command. Input cannot select paths or tool code. Files are content checked, provider output is bounded, and hashed immutable job directories support retries.
- `run_workflow_acceptance.cjs WORKSPACE architecture|finance|jarvis [checkpoint]` is an engineering harness with explicit local owner authorization, not a public production identity gateway. Financial source paths are the three host-selected files in WORKSPACE/sources. It creates private encryption keys/state; NEVER include keys in exported evidence.
- Workbook command configuration uses MANA_WORKBOOK_SCRIPT/MANA_WORKBOOK_CWD for a trusted installed exporter; do not take these from untrusted requests. No npm dependency installation or network call is performed by the workflow itself.
- No OS sandbox is established by subprocess use. Host tools are trusted; production isolation/CPU/memory quotas and malicious-filesystem protection remain required. Source and output directories must be protected from hostile concurrent mutation.
- Full suite: `node --test tests/*.test.cjs mana-ai/tests/*.test.cjs` -> 183 passed locally. Python integration tests explicitly skip when dependencies are absent; dedicated GitHub workflow installs the pinned dependencies. Do not interpret a skipped provider test as success.

## Defect found during actual execution

Workbook exporter diagnostic stdout polluted its JSON response after files were created, leaving an unknown task outcome. Fixed stdout/stderr separation and added a configuration digest for exporter code. The failed development attempt was not relabelled successful; the final evidence came from a new isolated run with the corrected provider. Unknown outcomes are still not blindly replayed. No secrets/keys or unfinished private state are delivered in the evidence packet.

## Remaining gates

General Persian/model grounding, voice, independent specialist council, real-project architecture (doors/walls/code/structure), comprehensive takeoff/costs, unrestricted document extraction/OCR, production audit/identity/restore, live-source integrations, parallel scheduling and authenticated UI remain open. Product modules from master 1.1 are preserved in the capability map; this increment does not imply they are complete. Next: strengthen geometric solver and document schemas, then introduce a verified model/provider and supervised request confirmation before broadening supported tasks. No merge/deployment/installation recommendation.
