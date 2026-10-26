# Schedule delay sensitivity

`createScheduleSensitivity` combines precedence-only critical-path calculations
with actual bounded reruns of the existing resource scheduler. A caller explicitly
selects one to sixteen task identifiers and a positive duration increase of up
to 10,000 relative time units. Each task is perturbed independently; the module
does not combine multiple delays or estimate delay probabilities.

For the baseline dependency network, the module calculates earliest/latest
starts, total float and precedence-critical membership. It separately reports
actual resource-scheduled starts. Float excludes resource competition and must
not be interpreted as a safe delay allowance for the resource-constrained plan.

For each selected task, the scheduler is rerun with only that task's duration
increased. The report shows the resulting finish change, schedule digest and
whether the horizon was exceeded. A positive finish change indicates sensitivity
in that run, not proof of a globally optimal critical chain. The deterministic
heuristic can reorder work; if a perturbation produces an earlier finish, the
report explicitly requires heuristic-reordering review rather than silently
claiming that adding delay improved productivity.

Attention order places horizon failures first, then larger measured finish
increases, then lower precedence float and task identifier. This is a transparent
triage suggestion, not a business-risk score. It does not account for money,
contractual penalties, safety, weather, procurement or regulatory priorities.
Unprobed tasks are listed explicitly.

The API requires project access, `native.schedule.analyze`, current host
authorization and exact input verification. The scheduler's own
`native.schedule.propose` grant remains necessary. Inputs and output stay
proposals: no baseline, crew assignment, approval or live service changes.
Pass the analyzer as `sensitivity` to `createAuditedNativeServices` and use
audited `sensitivity.analyze` at host integration boundaries.

## Explicit local operator command

Run this command from the extracted source directory:

```bash
node mana-ai/analyze-schedule.cjs "$PWD/mana-ai/examples/schedule-sensitivity.json"
```

The command accepts an absolute regular JSON file with tasks, capacities,
horizon, selected `taskIds` and `delayUnits`. It uses only local operator scope
and labels the input as independently unverified company evidence. It reads no
company database, contacts no model and executes no generated code. Production
host authority must not reuse the CLI's local-input verification callback.

The example shows why resource constraints matter: designB has two units of
precedence float, yet a one-unit duration increase delays project completion when
one shared team must perform both designs. With two available teams the same
increase is absorbed in the tested schedule. Tests verify both outcomes,
precedence-critical work, horizon exhaustion, deterministic results, bounded
probes, permissions, input immutability, the actual CLI and audited delivery.
