# Mission integration contract v1 (isolated pilot)

The GitHub `native/mission-runtime.cjs` is the sole reference executor/state owner for this integration. Server components are NOT imported or assumed compatible. `/opt/mana-native-lab/unified-v1/` remains untouched. This contract is a pilot API, not a completed distributed protocol.

| Entity | v1 contract / trust boundary |
|---|---|
| Mission | encrypted store kind MANA_MISSION_RUNTIME_V1, state.version=1; UUID id, orgId/projectId/requesterId, version CAS, requestKey/content digest, objective/goals, deadline, plan, inputs, tasks, events |
| Task | taskId, capabilityId, dependsOn; pending/running/succeeded/failed/unknown; pinned version/configuration/code fingerprint; result/digest; attempt history |
| Tool | trusted host registration only: id/title/requires/produces/workUnits/risk/version, optional configurationDigest and retrySafe; validate(input), validateDependencies(outputs), run(context), verify(output). Validators return strict true; no model-supplied functions |
| Execution | run receives input, dependency task IDs/capability IDs/results, AbortSignal, attemptId and stable mission:task idempotencyKey. Adapter must enforce external idempotency and isolation; JS timers cannot terminate blocking or uncooperative code |
| Evidence | planner requires org/project-scoped host-verified evidence; output validator proves only its defined invariant, not universal truth. Recovery requires authorized host verification and evidenceReference |
| Permissions | organization + explicit project grants + native.mission.create/read/run/control/reconcile + capability grants; host authorize callback rechecked. No production identity implied |
| Memory | runtime owns authoritative execution state. Other memories store references/observations, never independently mark completion. Personal Jarvis memory remains separate |
| Audit | events include actor/org/project/mission/task/time; atomic with encrypted state and version. Not independently anchored or tamper-proof against an authorized host rollback |
| Dashboard | read-only adapter projects runtime state; cannot treat the server's old /api/missions as a second authoritative store. No new dashboard endpoint is shipped in this increment |

## State and failure behavior

Claims persist before invocation. One active task per mission; dependency graph executes serially. Live concurrent runners do not claim twice. Expired claims become unknown and never automatically replay. A timeout/throw/cancel during invocation is unknown, because side effects may already exist. Late completion cannot overwrite an expired claim. Reconcile accepts only matching attempt, version, unchanged adapter and validated result. Retry is manual, capped at 3 total attempts, only for rejected completed output on an explicitly retrySafe adapter; unknown is never retried. Pause takes effect between steps; cancellation is cooperative. Consequential/regulated tools always stop at awaiting_approval: no sensitive operation execution is enabled.

Failed output currently stops for explicit retry/review. Automatic correction, fresh evidence collection and constrained replanning are NOT implemented. No arbitrary generated-code execution. State capacity 2MiB, 100 missions by default, 2000 events per mission, values bounded by approval payload serializer (16KiB). Host owns protected directories, key lifecycle and quota policy.

The underlying exclusive lock intentionally fails closed if occupied. A process killed while holding the short storage lock can leave a stale .lock: do not auto-delete it. An operator must prove all writers are stopped, preserve state/lock evidence, then remove only the stale lock and restart. Power-loss/fsync failure, distributed locks, same-scope rollback, transactional external effects and independent audit remain release blockers. SIGKILL testing covers a process killed during tool execution after a durable claim, not every instruction of the storage transaction.

## Server adapter prerequisite

Obtain source snapshots/hashes, license/dependencies, auth/tenant semantics, mission schema, durable storage path and key custody for all 10 reported server modules. Compare `mana-mission-engine`/`general-runner` execution and memory writers with this contract. Disable competing writers in an isolated integration environment before connecting a read-only dashboard projection. No server source or access was supplied in this workspace, so duplication beyond names is unverified. Do not expose 127.0.0.1:8891 or change the active service.

## Real file workflow

`node mana-ai/mission-document-run.cjs /absolute/inventory.json /absolute/private-workspace`

Input: `{"items":[{"id":"pump","label":"Site pump","onHand":2,"minimum":5}]}`. The dedicated workspace must be mode 0700. CLI creates private encryption key/state, then reads a pinned source, checks rows, derives shortages and writes a content-verified Markdown report. Re-running unchanged input reuses the mission. It places no order, changes no source, uses no model/network, and is a local operator CLI rather than a multi-user production gateway. The tool factory refuses symlink source files and bounds source size. Host directories must be trusted and protected from concurrent hostile filesystem mutation. Markdown is downloadable through a host file UI; this increment adds no public download route.

Run `node --test tests/*.test.cjs mana-ai/tests/*.test.cjs` from repository root. Tests include real SIGKILL/restart, contention, ciphertext corruption, stalled invocation, version mismatch, bounded retry and actual file artifact verification.
