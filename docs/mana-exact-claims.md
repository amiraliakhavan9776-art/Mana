# Exact period-claim calculation and shared-runtime report

Development increment after 9db39ef. No server installation, production records, payment, signing or merge. This is an executable bounded calculator/report workflow, not full commercial claim administration or acceptance of G1/G2.

## Contract

`financial/claims.cjs` implements six explicit modes: unit-price quantity × rate; lump-sum period tranche; area in m2 × rate; labor in hours or days × supplied rate; base amount × period percentage; and mixed lines using those five modes. A period percentage is NOT a cumulative percentage. Cumulative prior-certificate differences, negative correction certificates, escalations, legal deductions, variations, contractual penalties and approval workflows need separate reviewed contracts.

Amounts, quantities and percentages are unsigned decimal strings with at most 24 integer and 6 fractional digits. All arithmetic uses BigInt-scaled decimals; binary floating-point is not used for amounts. IRR and IRT are explicit; IRT normalization multiplies by 10, with no implicit conversion from labels or exchange-rate lookup. Area/labor units are validated; days are not silently converted to hours. Zero remains zero.

The caller must specify rounding scale (0–6), half-up/half-even/toward-zero mode, and per-line versus invoice rounding. Line exact and display amounts are separately shown; invoice rounding applies to the exact aggregate, so displayed rounded rows need not sum to the invoice gross. Deductions each round under that policy and use either explicit fixed amounts or an explicit gross-percentage basis. Tax has an explicit gross/after-deductions basis and supplied rate. There are no embedded statutory rates or assumed jurisdiction rules. Net and payment balance are separate; overpayment yields a negative balance/review flag. Deductions above gross abstain rather than invent a credit workflow.

Every line/deduction/tax policy has a source reference; the canonical input digest binds scope, amounts, rates, units, policy and references. These are references supplied by the host, not an assertion that the underlying site measurements/contracts were independently certified. Input strings/unknown fields, invalid units, missing policy, duplicate line IDs and out-of-scope records fail closed. `exact-json.cjs` preserves strict source interpretation by rejecting duplicate original JSON keys and unsafe numeric lexemes; decimal values belong in strings. Legacy reconciliation reuses that parser without changing its preservation contract.

## Execution and identity boundary

`createClaimTools` registers inspect → calculate → report in the SAME `native/mission-runtime.cjs`. Source path, raw SHA-256, organization/project and private output root are host configuration, never selectable by request inputs. The factory accepts only a regular, non-symlink, bounded JSON source with a supported policy. Every stage rechecks pinned source bytes. Tool fingerprint configuration includes calculator/parser/digest-module hashes. Output is a real JSON draft report with a checked receipt; existing conflicting files are not overwritten. Source/report directories must be protected from hostile concurrent filesystem mutation; this is not an OS sandbox.

The Runtime now supplies a frozen `scope` to adapter `validate(input,{scope})`, `run({scope,...})` and `verify({scope,...})`, including reconciliation. Scope contains server-authorized organization/project/actor and mission ID (null during initial plan validation). Existing adapters may ignore the additive argument; they do NOT acquire scope enforcement automatically. Claim adapters bind to the configured organization/project and reject foreign missions at input validation, before invocation. Client inputs cannot override that scope. This does not provision production identity or authorize financial effects.

`node mana-ai/mission-claim-run.cjs /absolute/claim.json /absolute/private-workspace ORGANIZATION PROJECT` runs the workflow as an explicitly authorized local operator. It uses an encrypted state/key in the private workspace, verifies/reuses completed missions on a second process and creates no public endpoint. `authorize:()=>true` belongs only to this local CLI harness, not a production authentication design. Do not upload its workspace/key as source.

Example: `mana-ai/examples/claim.mixed.example.json`, explicitly synthetic policy/data. Expected gross 9500.00, deductions 477.00, tax 902.30, net 9925.30, paid 500.00, balance 9425.30 IRR. These rates are test parameters, not legal guidance.

## Verification

- Six-mode numeric cases, exact large decimal strings, zero inputs, currency normalization, deduction/tax bases, overpayment and rounding boundaries.
- 108 combinations independently compared with Python Decimal (Python is a test oracle only, not a runtime calculator dependency).
- Actual three-stage runtime execution, encrypted restart, checked report bytes/digest and second-process CLI idempotency.
- Foreign project/client-scope denial, source mutation, duplicate JSON keys, symlink source and altered result/artifact rejection.
- Full existing regression suite and exact-head CI are required before treating this increment as verified. Passing these generated cases does not close real-project financial acceptance.

Local full-suite result: 218 passed, zero failures/skips on Node v24.22.1. A separate real CLI run generated `docs/generated/claim-example-report.json`; its source/report digests and second-process reuse are recorded in `docs/generated/claim-execution-evidence.json`. No private mission key/state was committed.
