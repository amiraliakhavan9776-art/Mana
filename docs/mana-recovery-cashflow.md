# Conditional recovery cashflow

`createRecoveryCashflow` connects one selected recovery scenario, the exact draft
budget calculator and explicit opening/future cash evidence. It detects modeled
interim cash deficits even when the total budget is adequate and closing cash is
positive. It never reads a bank account, borrows money, reserves funding or pays
an invoice.

The caller must explicitly choose
`work_accrual_fixed_upfront_expenses_before_funding`. Under this policy, resource
cost accrues uniformly during each task's interval, overhead accrues during the
remaining elapsed schedule, and the scenario's fixed charge occurs at `asOf`.
Expenses are accounted before funding at the same event time. This is a declared
model assumption, not inferred vendor payment terms or an actual bank ledger.

Opening cash and each funding record need an exact amount, matching currency and
evidence reference. Funding additionally needs a unique identifier and integer
relative time between `asOf` and the proposed finish. Identifiers and trimmed
evidence references cannot duplicate each other; funding cannot reuse the opening
cash reference. The host must still reconcile actual receipt identities, aliases,
existing commitments, project ownership and availability. Distinct strings alone
do not prove distinct money or guaranteed receipts.

The API requires `native.recovery.cashflow`, current project access and host
authorization for `recovery.cashflow`. All existing planning, comparison and rate
checks remain required. The host verifies the exact opening/funding payload bound
to the proposal and cost-report digests. The schedule is recomputed and matched
to its priced proposal before allocation. Stale or contradictory sources refuse
the calculation. No result is an authorization to execute the plan.

Monetary values use the shared exact-decimal implementation. Cash evidence must
already be exact at the chosen accounting scale; it is not silently rounded to
make a receipt fit. Cumulative resource components use the same line/invoice
rounding as the point budget. Event spending is the difference between cumulative
rounded totals, so it telescopes without allocating a rounding residual twice.
The finish total must reconcile exactly with the original draft cost.

The service examines all task starts/finishes and funding dates (at most 128
distinct boundaries, with at most 32 inflows). Before-funding cash is checked at
every boundary, so a same-date receipt does not hide an earlier within-period
deficit. Spending is monotone between boundaries under this policy. The output
shows minimum modeled cash, maximum modeled deficit, closing cash and the first
checkpoint where a deficit is detected. `firstDetectedShortfallAt` is a detection
checkpoint, not the exact fractional-time crossing instant.

`NO_SHORTFALL_IN_MODEL` is conditional on these data and assumptions. It does not
certify actual liquidity, contractual payment schedules, other commitments or
receipt certainty. Adequate total budget is reported separately. No taxes,
interest, financing fees, delayed receipts or stochastic risk are inferred.

Pass the service as `cashflow` to the audited native facade and use
`cashflow.analyze` at host boundaries. Intent/result digests are recorded without
placing cash evidence bodies in audit metadata.

## Local operator command

```bash
node mana-ai/budget-project.cjs "$PWD/mana-ai/examples/project-cashflow.json" --cashflow
```

The sample has a synthetic 92.05-unit total cost, 40-unit opening balance and
60-unit receipt at time 5. Closing cash is 7.95, but modeled cash immediately
before that receipt is -5.40. These are authored test figures, not market prices
or real company finances. The CLI labels its independently unverified local input
and selects only the explicit scenario and its fixed charge. Other CLI modes
remain separate and reject unexpected cashflow fields.

Tests run actual scheduling, monitoring, scenario costing and cash allocation,
covering interim deficits, early/late receipts, funded cases, exact rounding
reconciliation, duplicate evidence, currency/scale/time denials, revoked funding,
changed proposal identity, unknown evidence, audited delivery and the local CLI.
