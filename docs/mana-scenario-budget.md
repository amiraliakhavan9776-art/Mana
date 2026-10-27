# Exact draft resource budgets for recovery scenarios

`createScenarioBudget` runs the existing recovery-scenario comparator, then costs
its feasible remaining-work schedules using an explicit reviewed rate card.
The input needs a currency, named time unit, rate source, rounding policy,
resource rates, elapsed-time overhead rate, fixed charges for every scenario and
budget ceiling. Missing amounts must be supplied explicitly as zero when zero
is intended. No prices, legal rates or exchange rates are inferred.

The caller needs `native.recovery.budget`, project access and host authorization
for `recovery.budget`; all existing scenario/planner/monitor grants remain
required. The host must verify the exact rate/budget payload bound to the current
comparison digest and time-unit assumption. Revoked or unverifiable rates refuse
costing, rather than yielding an apparently affordable result.

Cost basis:

- Resource cost equals resource effort multiplied by its explicit unit rate.
  Rates are per allocated resource per named schedule-time unit, not per available
  capacity. Unused capacity is not billed automatically.
- Overhead equals proposed remaining elapsed duration (`makespan - asOf`)
  multiplied by the explicit overhead rate.
- Each scenario adds its own explicitly supplied fixed charge.

The named time unit must agree with the rate card. The generic scheduler does not
encode a calendar or enforce hours-versus-days itself, so the host must validate
this assumption against its baseline records. Fixed charges should include any
applicable mobilization or availability cost; omitted cost categories are not
implicitly free or already covered.

Rates and amounts are unsigned decimal strings with at most 24 integer digits
and six fractional digits. Arithmetic shares the BigInt decimal implementation
used by claim calculations. Rounding scale, half-up/half-even/toward-zero mode,
and per-line versus invoice rounding are explicit. Displayed components can sum
differently from the total under invoice rounding; exact unrounded totals remain
visible. The rounded estimated total is compared with the exact supplied ceiling.
Budget variance preserves the exact difference without hiding it by re-rounding.

IRR and IRT are explicit and must match between rate card and ceiling. Normalized
IRR uses the same explicit ten-to-one denomination conversion as the existing
claim calculator. No foreign-exchange conversion is performed.

The report separates cheapest options, options within the ceiling, earliest
within-ceiling options and nondominated cost/time options. Resource feasibility
and review obligations come from the existing comparator. A schedule that cannot
fit the horizon is not priced; incomplete evidence does not become a cheap option.
No scenario is selected or adopted automatically.

These are draft remaining-work estimates. Taxes, wage obligations, contract
entitlements, penalties, contingencies, actual costs and profitability are not
inferred. An option within this estimate's ceiling is not a certified project
budget, payment authorization or financial approval.

## Local operator command

```bash
node mana-ai/budget-project.cjs "$PWD/mana-ai/examples/project-budget.json"
```

The CLI builds a local baseline from the explicitly supplied task file and
calculates alternatives with explicitly supplied observations and rates. It labels
the inputs as independently unverified. The sample rates are synthetic, not market
quotes. It has no database connection, model provider, payment or live writer.
For host integration, pass the service as `budgeting` to the audited native
facade and call `budgeting.compare` with trusted host authority callbacks.

## Arithmetic dependency revision

The existing claim calculator now imports shared exact arithmetic. Claim-tool
configuration fingerprints include this dependency. Existing in-progress missions
with a different code fingerprint are fenced for review/replanning rather than
silently continuing under new arithmetic code. Keep old release directories and
state files; there is no automatic state migration or deletion.

Regression tests cover actual end-to-end scenario costing, exact amounts above
JavaScript safe-integer money values, rounding boundaries, currency/time-unit
denials, revoked rates, infeasible scenarios, unknown evidence, audited delivery,
the local CLI, existing six-mode claims and arithmetic-dependency fencing.
