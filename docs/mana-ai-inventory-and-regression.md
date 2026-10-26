# Mana AI — inventory and regression evidence

Date: 2026-10-26. Reviewed source: cc614aeb0af87a20216b563c114bc8d353465d05.
Status: file enumeration complete; semantic/workflow inventory and full regression acceptance INCOMPLETE. G1/G2 remain open.

## Executed checks
- Recursive Git tree: 116 tracked files, not truncated, no AGENTS.md. See [manifest](mana-ai-source-manifest.json), which describes the source revision before this follow-up.
- Downloaded all 116 files; every local Git blob hash matched the tree. Zero mismatches; no live user data used.
- Linux, Node v24.22.1, Python 3.12.14.
- Command: `node --test --test-reporter=tap tests/*.test.cjs mana-ai/tests/*.test.cjs`.
- Existing suite: 102 passed, 0 failed, 0 skipped.
- With new legacy behavioral tests: 106 passed, 0 failed, 0 skipped, approximately 1.39 seconds.
- New tests execute actual legacy functions in a VM with synthetic storage: CPM branch/lag/float; cycle/empty schedule; financial-record and Persian-text save/reload; storage error reporting.
- Unchanged index.html Git blob: 136e7b4267967df47b62a8491da96ac5f5694211.
- index.html SHA-256: 9a359b045e01b1738646635375e0aef7a4e065ab57c57258d939d48c1924ab94.
- Browser regression NOT run: no Chromium executable found in the inspected environment. No real model, speech runtime, GPU, desktop app, production database or restore drill was exercised.
- GitHub source-revision workflows reported success. Local Node 24 results do not substitute for Node 20/22 CI or production-runtime validation.

## Initial asset map
| Asset | Purpose / remaining inventory |
| --- | --- |
| index.html | Persian RTL legacy application; 32 script blocks; effective overrides and workflows still need mapping |
| server.cjs, local-chat-ui.cjs, secure-pilot.cjs | Different service entry points; require endpoint/authentication/policy matrix |
| mobile-ui.cjs, voice-gateway.py | Mobile and speech; authenticated end-to-end/runtime validation remains |
| security.cjs, session-auth.cjs, conversation-api.cjs, governance.cjs | Multiple identity/policy representations; canonical principal and project membership unresolved |
| audit.cjs, durable-audit.cjs | Memory/local chain logs; independent anchoring, concurrency and complete event schema remain |
| encrypted-conversations.cjs, memory.cjs | Persistence experiments; rotation, recovery, retention and multi-process behavior remain |
| import-boundary.cjs, export-loader.cjs, snapshot.cjs | Bounded projects/documents exports; not full financial migration |
| agent-runner.cjs, agent-tools.cjs, autopilot modules | Draft/read prototypes; durable approvals and worker isolation remain |
| mana-engine.cjs, engine.cjs, openai-provider.cjs | Inference orchestration; proprietary-core boundaries/benchmarks remain |
| specs, examples, pilot docs, workflows and tests | Requirement/implementation/evidence traceability remains |

## Confirmed legacy findings
Line references below apply to the reviewed source SHA.
- index.html:1040 uses mana.db.v2; :1046 loadDB falls back to seeded demonstration data on missing storage or parse errors; :1049 save reports write errors via toast.
- :12673–12676 assigns missing legacy invoice status to approved with system approver. Preserve historical provenance; do not treat this as verified approval in migration.
- :9542 calls localStorage.clear; map the owning reset handler, confirmation and affected keys.
- Literal storage keys include mana.dash.widgets and mana.lastBackup; theme and palette persistence also exists. Computed keys and attachment storage need enumeration.
- DB property references include projects/contracts/invoices/cash, pettyFunds/pettyTx, personnel/attendance, tasks, changes, guarantees, equipment/equipmentLog, purchaseOrders, suppliers/subcontractors, inspections, permits, punchLists, letters, minutes, risks, hse and signatures. These references are not a validated complete schema.

## Inventory completion checklist
- [ ] All routes, handlers, initialization and overrides with effective execution order.
- [ ] All fields, IDs, references, defaults, schema versions, attachment stores and computed keys.
- [ ] Currency, rounding, deductions, dates, statuses and business examples.
- [ ] Read/write/delete/approve/export/import/reset paths and security boundaries.
- [ ] Runtime/build/model/CAD dependencies, versions, licenses, checksums and offline availability.
- [ ] Capability -> source -> data -> risk -> synthetic fixture -> expected outcome -> test matrix.
- [ ] Named reviewer/owner and evidence for every unknown before gate closure.

## Minimum regression backlog
| Area | Missing acceptance evidence |
| --- | --- |
| UI/workflows | Project/contract create/edit; invoice submit/approve/reject/revise; RTL/navigation, refresh and multi-tab behavior |
| Financial | Claim modes, deductions, retention/tax, petty cash/cashflow, exact totals, currency/rounding and invalid input |
| Migration | Historical/malformed schemas, duplicates, relations/attachments, export-import reconciliation, partial failure and backup restore |
| Access | Cross-tenant and cross-project denial, field restrictions, revocation and forged principal |
| Approval/execution | Payload/version changes, expiry/replay, retries, concurrent execution and unknown outcomes |
| Audit/recovery | Disk-full, rewrite/truncation, multiple writers, restart, key recovery/rotation |
| Self-hosting | Block international egress and demonstrate required local workflows |
| Model/design | Persian grounding/injection/provenance and verified editable CAD/BIM with professional review |

No gate approval, production datastore, financial limits, project visibility or recovery objectives have been inferred. See [delivery gates](mana-ai-delivery-gates.md).

## Follow-up verification

See [control verification](mana-ai-control-verification.md) for 122 passing Node tests, scoped project grants, anchored-audit interfaces, encrypted backup/restore verification, static line-level inventory and separate browser CI. Historical observations above remain scoped to cc614aeb; this follow-up does not close G1/G2.

## Persistent-controls follow-up

See [implementation and validation](mana-ai-persistent-controls.md) for the corrected settlement defect, 135 passing Node tests, persistent approval lifecycle and startup-configured audit checkpoint. index.html has changed in this follow-up and the generated static index was regenerated. Full G1/G2 acceptance remains open.
