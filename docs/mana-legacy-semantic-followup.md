# Lexical inventory and approval-effect regression

Baseline: 5b5180918dc8034adfe1fa3e1d963d4cba66a6b2. Isolated repository work only. Server integration inventory and G1/G2 acceptance remain open.

## Evidence method

`npm ci --prefix tools/parser --ignore-scripts --no-audit --no-fund` installs Acorn 8.15.0, a development-only MIT-licensed parser. Its exact version, registry origin and SHA-512 package integrity are committed in `tools/parser/package-lock.json`. This adds no browser or production dependency. Offline developer/CI operation still needs an approved local package cache; this increment does not claim offline acceptance.

`node tools/inventory-ast.cjs` produces the full lexical evidence graph; `--summary` produces the checked-in, source-hash-bound summary. The analyzer parses all 32 inline scripts, identifies lexical scopes, declarations, direct assignments, registration calls, DB collection references and storage sites. Comments/string contents do not become JavaScript events. Distinct closure-local names remain distinct. A dispatcher consisting exactly of `ACT[n] = f` connects its literal registration calls to direct assignments in the same candidate chain. Dynamic keys remain unresolved.

The baseline generated graph contains 4,052 scopes, 4,598 events and 53 unresolved sites. These are source facts/candidates, not proof that every branch executes. IIFEs retain caller activation; callbacks/named function bodies are deferred. Object aliases, reassignment, computed access, event order, reflective writes, conditional returns and the effective state after application initialization still need runtime/manual evidence. The HTML extractor assumes ordinary script markup, excludes comments and raw-text style/title/textarea, and is not a general HTML5 parser.

## Manually traced invoice path

This historical trace and its line references apply to commit 44943ed9e32acb3662515850b727a6c385721bef. Later generated evidence describes its own source digest; see `mana-invoice-save-correction.md` for the subsequent initialization/reachability and save-effect fixes.

| Source | Behavior and evidence boundary |
|---|---|
| index.html:1117 | Global `act(n,f)` stores handlers in `ACT[n]`; click dispatcher invokes the current registered handler |
| index.html:1532, :6376, :8188 | Invoice creation handler is replaced by mobile form and later full invoice save implementation; commented historical Iran-form code is not an executable script |
| index.html:12342 | Wrapper captures the previous save handler and schedules material increments; its interaction with drafts and failed saves is an OPEN regression item |
| index.html:12969 | Final wrapper captures the previous handler and schedules draft assignment; failed-save/wrong-last-record behavior remains OPEN |
| index.html:12673 | Missing historical status is promoted by the legacy app to system-approved; migration must preserve original provenance and must not treat it as verified approval |
| index.html:12730 | Material reconciliation derives consumption from approved invoices only, including name-based fallback; ambiguous names require review |
| index.html:12870 onward | Approve/reject/unapprove call material reconciliation then project/activity progress recalculation |
| index.html:12943 | Automatic progress previously updated only when strictly positive; reversal of the final approval left stale nonzero activity/project progress |

## Reproduced and corrected defect

Two tests execute the actual material module and complete final approval script in a VM with synthetic records and UI-only stubs. Before the fix, both failed: progress remained 50 instead of 0 after unapproval, or 20 instead of 0 after rejecting the final contributing invoice. The fix allows a zero recalculation when the activity already has `progressSource === 'auto'`. Manual activity progress is preserved when there is no automatic contribution. No financial formulas, historical approval mappings or authenticated server policies changed.

Checks include approved cost/material/progress, partial reversal from 70 to 20, final reversal to zero, project weighted progress and manual activity preservation. A separate real Chromium regression covers approve/unapprove and reload persistence using the complete application. Its result must be checked at the increment SHA; VM tests do not substitute for it.

Local verification: `node --test tests/*.test.cjs mana-ai/tests/*.test.cjs` passed 204 tests, zero failures/skips on Node v24.22.1. The two reversal tests failed with stale progress values before the one-line fix and passed afterward. Seven parser regressions verify binding separation, comment/string exclusion, deferred/conditional sites, dispatcher chains and syntax-error refusal.

## Remaining supported work

- Trace and test delayed invoice-save wrappers, including invalid saves, edits, drafts and repeated saves before changing them.
- Complete initialization/override, collection/field/relation and DOM/navigation/form inventories, then connect each to domain-reviewed expected outcomes.
- Inventory all six claim modes explicitly: a generic quantity/price invoice form is not evidence that six distinct claim contracts exist.
- Complete historical financial/currency mappings, cross-tab conflicts, restore/key recovery and server module/identity adapter inventory.
- Keep real-data integration, production activation and merge gated. No review/owner approval inferred from generated evidence or passing tests.
