# Invoice initialization and save effects

Baseline: 44943ed9e32acb3662515850b727a6c385721bef. Repository-only correction, no production migration/deployment or gate approval.

## Reproduction and change

The lexical inventory prompted execution of the complete mobile-form, activity-link and final approval scripts together, rather than merely extracting handler bodies. This reproduced `ReferenceError: invRowCard is not defined`: the mobile form declared the renderer inside its IIFE, while the later activity-link IIFE read it as a global. As a result, the activity-link script aborted before installing its remaining handlers. The row renderer now has an explicit global binding assigned by the mobile-form script, so later patches and the original form resolve the same function.

After making the link script reachable, three additional failures were reproduced: newly saved invoices had no immediate draft status/receipt; a failed save could later change an unrelated last invoice; and saving/editing a pending invoice incremented consumed material despite no approval (two saves yielded consumption 10 instead of 0). These were defects in the newly reachable old code, not proof that those effects previously ran in the browser. Earlier lexical candidate chains alone did not establish reachability.

The current full invoice save handler returns the exact saved record, creates new invoices synchronously as draft, rejects an unknown project or missing edit target before mutation, and preserves existing invoice identity/payments on edit. The link wrapper acts only on that successful record and recomputes material consumption from approved records; it no longer schedules quantity increments. If an invoice changes project, both the previous and current project's materials are reconciled. The final status wrapper uses the returned record rather than a delayed lookup of the last array element.

## Evidence

`tests/mana-invoice-save-effects.test.cjs` executes the actual complete mobile-form, activity-link and final approval scripts plus the actual intervening full save handler. DOM input/UI helpers are stubs; material/approval/save wrapper logic is actual application code. Initial setup failed at the renderer ReferenceError before the scope fix; subsequent failures exposed draft timing, wrong-record mutation and double consumption. Current checks cover successful receipt/draft, failed-save non-mutation, repeated pending edits/payment preservation and invalid project/edit target denial.

Separate Chromium checks now capture uncaught startup exceptions and use the actual invoice form, project/activity/material selects, save button, delayed-effect window and reload. Consult the exact revision's CI result; VM mocks do not establish full browser or production acceptance.

Final local command: `node --test tests/*.test.cjs mana-ai/tests/*.test.cjs` on Node v24.22.1: 208 passed, zero failed/skipped. Source and lexical/static evidence were regenerated after the HTML changes.

## Remaining limits

Legacy browser approvals remain local and are not authenticated production authorization. Editing a historically approved invoice, approval provenance, ambiguous name-based material matching, project weighted progress after every possible edit/delete, money/rounding, complete six-mode claims, backup/cutover and server source inventory remain open. No historical approval migration is changed here. Global form/helper compatibility is tested for this narrow workflow; full semantic G1/G2 review remains required.
