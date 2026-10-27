# Explicit rate-bound budget analysis

`createBudgetRange` evaluates the existing scenario-budget service twice, using
explicit lower and upper rate cards for the same fixed schedules. It identifies
options within the supplied ceiling across all rates modeled by those bounds,
options sensitive to rates, and options already over budget at the lower rates.
It does not assign probabilities or forecast market prices.

Each endpoint retains resource rates, elapsed overhead and per-scenario fixed
charges. Corresponding rates must be nonnegative and ordered lower <= upper.
Resource/scenario identifiers, currency, time unit and rounding policy must match.
The endpoints may cite different reviewed source references. Endpoint currency
conversion, mixed rounding assumptions and silently missing rates are refused.

With fixed nonnegative resource effort and elapsed duration, component costs
and the permitted rounding policies are monotone in rates. Thus all-low/all-high
costing bounds this particular cost model even for combinations of interior
rates. The result is conditional on supplied bounds and included cost categories.
It is not a guarantee about actual spend. Duration changes, changes in resource
productivity, taxes, omitted charges, rate dependencies and market uncertainty
outside the supplied bounds are not modeled.

The analysis requires project access, `native.recovery.budget.range`, current
host authorization for `recovery.budget.range`, and verification of the exact
bound payload against the current project/source/scenarios. Both endpoint rate
cards independently pass the budget service's existing current authority checks.
Host callbacks must resolve these from trusted records. Caller booleans or
model-generated consent do not establish authority.

Endpoint comparisons must refer to identical scenario evidence digests and
proposal identities. A source change between endpoints refuses the analysis.
Incomplete progress and infeasible scenarios retain their blocking status;
missing results do not become zero-cost or affordable options. The output keeps
review/signoff obligations, rate digests, baseline-preservation flags and exact
decimal cost strings, including large values beyond Number integer precision.

`withinAllModeledRatesScenarioIds` lists conditional within-ceiling options;
`rateSensitiveScenarioIds` lists options inside the ceiling only at some modeled
rates; `overBudgetAtLowerRatesScenarioIds` lists lower-end overruns. Earliest
completion is reported only among conditional within-ceiling options. No option
is automatically selected, approved, adopted, purchased or paid.

Pass the service as `budgetRanges` to `createAuditedNativeServices` and use
audited `budgetRanges.analyze` at host boundaries. The same finite JSON/digest
bounds apply as for the underlying services.

## Local operator command

```bash
node mana-ai/budget-project.cjs "$PWD/mana-ai/examples/project-budget-range.json" --range
```

Here `rateCard` is the lower endpoint and `upperRateCard` the upper endpoint.
The CLI uses explicit local operator input and labels the lack of independent
company evidence/rate verification. Its example figures are synthetic. The
existing point-estimate command continues to work without `--range`; it refuses
an unexpected upper card rather than silently ignoring it.

Tests exercise the actual scheduling, monitoring, recovery, comparison and exact
budget stack, conditional affordability, price sensitivity, zero rates, exact
large amounts, inverted bounds, incompatible units/rounding, missing identifiers,
revocation, scope denial, unknown progress, infeasibility, changing endpoint
sources, audited delivery and the actual local CLI.
