# Offline mission scheduling and conservative model comparison

This increment implements two bounded master-plan components without claiming that the entire engine or coding model is complete. Existing G1/G2 and production acceptance remain open. No company data, live service, model weights, installed release or rollback copy is modified or deleted.

## Engine: relative-time resource scheduling

`native/resource-scheduler.cjs` checks project access and an explicit `native.schedule.propose` grant, validates up to 128 tasks and sixteen renewable resource capacities, rejects cycles/missing dependencies/excess demand, and proposes a deterministic resource-feasible schedule. It prioritizes remaining precedence length, schedules on interval boundaries rather than scanning time ticks, and returns a precedence-only lower bound plus proposed makespan. It does not claim an optimal schedule or proof of infeasibility when the heuristic cannot fit the horizon. Durations and capacities must be explicitly supplied: work units are not converted into calendar days, real staff, money or approvals.

`scheduleMissionPlan` accepts only a same-scope proposed mission plan and an explicit estimate for every leaf step. It preserves ordered dependencies and professional-signoff/approval flags in the scheduled proposal. It does not reserve resources or execute business actions. It is a pure host-side planning boundary; production identity and current host authorization are required before any endpoint exposes it.

Offline runnable example: `node mana-ai/plan-project.cjs "$PWD/mana-ai/examples/project-schedule.json"`. The fixture represents relative time units and declared resources, not an accepted company project. Tests check nonoverlap, parallel independent resources, long sparse durations, cycles, insufficient horizon, grants, scope, estimates and signoff preservation.

## Learning: compare actual functional evidence

`training/compare_coding_reports.py BASELINE CANDIDATE` requires completed reports, full comparable task coverage, matching benchmark/corpus/seed/generation settings and matching verifier policy. It rechecks case indexes, boolean outcomes, candidate hashes and aggregate counts. Any previously passed case becoming a failure rejects the candidate, even when that task had not passed overall and another task improved. A changed checkpoint with newly passed tasks and no case regression is only `IMPROVED_REQUIRES_REVIEW`; it is never authorization to promote, deploy or delete old checkpoints. Identical weights cannot establish a new model improvement from conflicting reports.

Reports and digests live in host-controlled files, not an independently anchored audit system; the comparator is a measurement utility, not authority against a malicious host. The existing three-task benchmark is too narrow for general coding acceptance. The user's measured 1100-step checkpoint scored zero of three, so it remains a baseline, not an accepted programmer. Broader authorized training data, architecture work and new held-out functional benchmarks are still needed.

## Continuity if connectivity is lost

Installed Node, Python/NumPy wheel, code, accepted local sandbox and checkpoints continue to exist on the user's server independently of this chat. Their offline commands can be run without downloading models. This does not mean the assistant continues background development or that the small model can finish the master plan itself. Retain the known working releases and checkpoint at `/opt/mana-engine-lab/native-training/run.LULFtw/step-00001100`; cleanup remains deferred until actual broader acceptance and an explicit file list.
