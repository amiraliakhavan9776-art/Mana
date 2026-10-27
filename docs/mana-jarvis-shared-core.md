# Jarvis shared-core increment

Jarvis is a personal interface to `native/mission-runtime.cjs`, not a second intelligence engine or a second executor. `jarvis/service.cjs` binds a host-authenticated owner (account + realm) to a synthetic private organization/project. Requests cannot supply principal, project, evidence or tool code. Host evidence and host-installed tools remain mandatory. Host policy checks account, action and registered tool permissions; this initial policy conservatively requires all configured tools to remain permitted. Policy callbacks must verify authentication, not trust an arbitrary request's account ID.

`jarvis/personal-memory.cjs` reuses encrypted-state with owner-bound authenticated encryption and separate keys/files from mission state. Supported records: goal, preference, commitment, decision, note. Saving/correcting requires explicit consent; retention is 1 minute–365 days, correction/deletion uses record revision, expired records are hidden, explicit purge removes expired records. Retrieval is bounded substring matching, NOT semantic search. Statements are labelled user_statement, never used as verified evidence or permission grants. No automatic transfer to company memory or model context. Erasure is logical current-state deletion, not guaranteed destruction of backups or storage remnants. Authorized-host rollback and production key rotation remain open.

## Status of the expanded instruction

| Scope | Status / evidence |
|---|---|
| Shared MANA runtime for personal missions | Implemented and isolated tests pass; structured host requests only |
| Personal encrypted consented memory / corrections / retention / deletion | Implemented and isolated tests pass |
| Persian/multilingual natural language, intent and ambiguity grounding | Existing model prototypes; not wired to this personal service |
| Voice streaming, interruption, licensed voice, recording consent | Existing voice experiments; full Jarvis pipeline not implemented |
| Image/video/OCR/project files | No personal multimodal pipeline accepted |
| Calendar/tasks/email/meetings/reminders | No account connectors or autonomous sending enabled |
| Wealth Architect / economic council | Required analytic backlog; no validated financial-advice engine, trade or payment tool |
| Parallel task execution / resource scheduler / compensation | Not implemented; current runtime serializes tasks within a mission |
| Automatic repair/replan / independent specialist council | Not implemented; existing symbolic proposals/criteria are limited |
| Hierarchical reasoning / causality / metacognition / calibrated error probabilities | No accepted general capability; bounded symbolic algorithms are not substitutes |
| Semantic memory / knowledge graph / source freshness ledger | Not implemented end-to-end |
| Research / model cost-quality routing / offline language capability | Provider/retrieval experiments; actual model availability required |
| Intelligence Foundry / coder / sandbox self-repair / benchmark release gates | No generated code executed by this increment; production approval remains mandatory |
| Universal profession packs / Company OS / digital twin / strategy / organizational engines | Preserve previous scope; see mana-capability-status-v1.1.md; mostly backlog/prototypes |
| AEC phases 0–2 / editable drawings / CAD/BIM / takeoff / estimation / construction | Preserve all listed scope; no unverified CAD/render/engineering claims |
| Render workers without GPU / design revision impact propagation | Required adapters/backlog; no real renderer or dependency invalidation shipped |
| Full takeoff line items / dated prices / units / deterministic financial rules | Existing limited facade/legacy calculations; comprehensive engine not complete |
| Expanded section 17 onwards | User message ends at the heading introducing claim modes; use previous confirmed six-mode scope until remainder supplied |

## Executable entry points

Host calls `createJarvisService({owner, authorize, evidenceSnapshot, tools, missionFile, missionKey, memoryFile, memoryKey})`. Require distinct 32-byte keys and protected private state directories. `createMission` accepts objective/goals/inputs/requestKey/maxWorkUnits, then get/runNext/pause/resume/cancel/retry/reconcile delegate to the shared runtime. Memory methods accept subject and per-method fields; authentication remains the host's responsibility. No public HTTP/voice interface is introduced, and no company or live server is connected.

Validation: `node --test mana-ai/tests/jarvis.test.cjs` covers consent, correction races, expiry, deletion, encrypted restart, foreign account/realm denial, ciphertext transplant rejection, evidence injection rejection, revocation and actual shared-runtime tool execution. Full regression suite is also required.

Next: review actual Core v5 server source against v1 contracts, integrate authenticated personal API in isolated staging, then add constrained conversational grounding and a permitted real personal-document mission. Production identity, independent audit, backups/restore, quota/sandbox and bridge approvals remain prerequisites for consequential workflows.
