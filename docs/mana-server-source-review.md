# Server snapshot review and read-only mission compatibility

Reviewed archive: user-supplied `MANA-SERVER-SOURCE.tar.gz`, reconstructed from pasted Base64 and verified through gzip CRC/size plus safe archive entry inspection. Compressed size 17,740 bytes; archive SHA-256 `e0e83c4ea21d93fd9fe907180f936b3830638b63a36afd9c09b7a3593cb879f5`. Forty-two regular files, 58,754 source bytes. No absolute/traversing/duplicate/link entries were accepted. Original source was inspected separately, not imported into the production tree or executed. The public repository contains derived inventory/review evidence, not the full original private source archive.

`docs/generated/server-source-inventory.json` records every supplied file hash and static import/effect candidates. Regenerate locally with `node tools/inventory-server.cjs PRIVATE_SNAPSHOT_DIRECTORY`; Acorn is a development dependency. All 21 modules, the dashboard and supplied tests/candidates were inventoried. Forty-one files parsed; one generated candidate (`evolution/9bedca19-ac44-4f61-b579-dad3f5fbc126/candidate.cjs`) has invalid syntax at line 1, column 25. This is recorded as unparsed, not silently treated as safe or operational. No candidate code was executed.

Snapshot integrity is not a live-server attestation. The export deliberately omits business JSON/state, credentials, databases, model weights and service/proxy configuration. No source files from `runtime-v3.1` were present in the supplied archive; this does not prove that directory is empty on the host. Dependency versions/licenses and active systemd/Nginx/authentication wiring are not established by this export.

## Source-to-contract findings

Line references below are to the immutable supplied file hashes in the inventory.

| Source | Confirmed observation | Integration decision |
|---|---|---|
| `modules/mana-intelligence-core-v5.cjs:8` | Executes rule council then `runMission`, writes a report; validates `council.ok`, but does not stop on its business blockers | Do not treat the wrapper/report as a general independent intelligence engine or authorization; preserve the shared native Runtime as executor |
| `modules/mana-general-runner.cjs:12` | In-memory DAG execution for arithmetic/health and a separate report write; no durable per-step claim/recovery | Do not call it beside the reference executor or replay unknown steps |
| `modules/mana-unified-runtime-v4.cjs:8` | Fixed validation/finance/risk/report sequence with direct file output | Preserve its arithmetic intent through explicit reviewed domain adapters, not a competing runtime/state owner |
| `modules/mana-orchestrator.cjs:55` | Plain JSON task graph; `complete` accepts an evidence string without trusted identity/output verification | Historical records are observations, not automatically verified completions or permissions |
| `modules/mana-mission-memory-v51.cjs:8` | Import-time mkdir and plaintext history writes; history is not organization/project/actor scoped | No automatic import/require or blind migration into scoped memory |
| `modules/mana-scoped-memory.cjs:5` | Resolves `better-sqlite3` through absolute `/opt/mana-ai/security/users.cjs` anchor | Host dependency outside the snapshot; do not assume its identity/database semantics or install a substitute silently |
| `modules/mana-protected-memory.cjs:18` | Requires token and an authorizer callback; passes requested organization/project to that callback | Identity verification and membership mapping remain host responsibilities; token presence alone is not authenticated scope |
| `modules/mana-financial-council.cjs:4` | Imports `../v0.6/mana-finance.cjs`, absent from snapshot; supplied `modules/mana-finance.cjs` is a different path | Record unresolved snapshot dependency; do not claim missing on live host or silently rewrite to an assumed equivalent |
| `modules/mana-mission-engine.cjs:31` | Integer-IRR management-fee arithmetic with explicit remainder; source evidence labelled user-supplied/unverified | Keep that provenance; it is not a verified forensic financial audit |
| `modules/mana-council.cjs:4`, `modules/mana-scenarios.cjs:3` | Fixed profitability/risk/duration rules and rankings | Useful bounded rules, not independent specialist consensus or calibrated forecasts |
| `modules/mana-self-evolution.cjs:83`, `modules/mana-native-evaluator.cjs:10` | Syntax check and regex screening with explicit preliminary/manual-review status | No syntax-only promotion or security certification; generated candidates remain disabled |
| `modules/mana-evolution-audit.cjs:12` | Reads omitted benchmark/repair JSON at module load and launches systemd-run tests | Never require as an adapter; historical sandbox arguments are source evidence, not a reproduced sandbox run |
| `modules/mana-local-ai.cjs:25`, `modules/mana-ai-coder.cjs:11` | Local inference HTTP port 8794 / Gemma model configuration | Provider wiring only; no weights, availability or current model quality verified here |
| `dashboard/server.cjs:67` | Starts unauthenticated localhost:8891 server and reads plaintext report/history JSON | Do not import it or expose it publicly; retain route compatibility through an authenticated projection |

## Implemented compatibility boundary

`integration/mission-projection.cjs` supplies the old `/api/missions` and `/api/missions/:uuid` route shapes as a handler factory. It has no default listener, no implicit identity, and no legacy file/history reader. The host must provide authenticated principals, a fixed project, an audit sink and the reference Runtime. Client query fields cannot override organization/project/principal.

The reference Runtime now provides read-authorized project-scoped metadata pagination. It checks both project grants and the current host authorizer. Projection detail contains task IDs/capabilities/status/attempt counts only, never objective, inputs, tool results, report contents, credentials or encryption state. Native execution statuses are preserved; `approved:false` never converts historical booleans or completed draft execution into a financial/professional approval. A subsequent audited rollout may provide an appropriate authenticated UI; the original dashboard HTML is not mounted unchanged.

Every handled read passes through the supplied audit sink before its response is released. Audit failure returns 503 without the result; runtime corruption/unavailability is not silently replaced by legacy files. Only GET is supported. Pagination is bounded to 1–100 and cursors are confined to the authorized project. No write/approve/run/migrate endpoint is introduced.

## Verification and remaining gates

Static inventory tests prove inspection does not load modules, flags absent snapshot imports and invalid syntax, and rejects symlinks. Real loopback HTTP tests exercise the actual encrypted Runtime, project pagination, redaction, unauthenticated/foreign/missing/revoked access, forged query scope, duplicate/invalid pagination, write denial, audit failure and unchanged mission-state bytes after reads.

Local complete suite: `node --test tests/*.test.cjs mana-ai/tests/*.test.cjs`, Node v24.22.1: 224 passed, zero failed/skipped. Six added tests cover inventory/projection; previous claim/geometry/legacy/runtime tests remain included. Exact-head CI remains separate evidence.

Remaining before live integration: active service/proxy/identity and database contracts, license/dependency inventory, complete restore/key recovery, historical record mappings and independent audit infrastructure. The source-availability blocker for these supplied modules is resolved; G1/G2 are not closed. Existing services, systemd, port 8891, server data, model process and deployment remain untouched.
