# Corrective schedule scenario comparison

`createRecoveryScenarioComparator` evaluates one to eight explicitly supplied
recovery scenarios through the existing corrective planner. Each scenario has a
unique identifier, explicit remaining-task duration/resource estimates, and
resource capacities. The original baseline, observations, monitoring time,
weights and future horizon remain common. Nothing infers productivity gains
from added crews: each alternative's estimates need current host verification.

The caller needs project access, `native.recovery.scenarios` and current host
authorization for `recovery.scenarios`. Existing planner, monitor, evidence and
estimate checks execute for every scenario. Comparisons refuse changing
baseline/assessment bindings. Missing or stale evidence stops the comparison;
authorization or malformed-input failures are not hidden as scheduling failure.
Otherwise valid scenarios that cannot fit the horizon are reported explicitly.

For each feasible proposal, the report shows:

- Proposed finish and variance from the original baseline finish.
- Resource effort separately for each resource: duration multiplied by demand.
- Peak simultaneous demand separately for each resource, using half-open task
  intervals, as in the existing scheduler.
- Required review/signoff task identifiers and the exact proposal digest.

The report identifies earliest-finishing scenarios and Pareto-nondominated
scenarios. An option dominates another only when it is no worse on finish,
every resource's effort and every resource's peak demand, and strictly better
on at least one measure. Equal options both remain nondominated. Missing resource
usage counts as zero; availability limits are not billed as actual consumption.

Different resource units are never summed into one score or converted to money.
A faster option requiring more simultaneous staff may therefore remain a
tradeoff. A nondominated result is not proof of affordability, availability,
safety, legal compliance, optimality or superiority on unmeasured criteria.
Selection and adoption require separate reviewed decisions. No resource is
reserved and no baseline or live service changes.

Pass this service as `scenarios` to `createAuditedNativeServices` and use its
audited `scenarios.compare` method at host boundaries. Results contain compact
metrics and proposal hashes; recompute the selected proposal with the exact
same inputs before requesting its independent review. Existing finite plain-JSON
digest limits remain enforced in addition to the eight-scenario limit.

Regression coverage runs the actual scheduler-monitor-recovery chain, checks
staffing versus finish-time tradeoffs, dominance, retained approval steps,
infeasible horizons, incomplete evidence, revoked estimates, denied scopes,
immutable inputs, audited delivery and safe handling of inherited resource names.
