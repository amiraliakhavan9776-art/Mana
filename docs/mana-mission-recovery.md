# Mission recovery proposals

The shared mission runtime exposes `recoveryPlan({principal, project, missionId})`.
It reads encrypted state and returns advice only: `actionsExecuted: 0` and
`approved: false`. It neither retries an adapter nor writes mission state.

For a failed invocation with rejected output, the proposal permits a same-task
retry only when the adapter explicitly declares retry safety, all active adapter
fingerprints still match, current host and principal run/control permissions
allow it, fewer than three attempts have occurred, and the original work budget
and deadline permit another invocation. Successful task identifiers and the
expected mission version accompany the proposal.

Unknown outcomes require reconciliation. Cancellation or expiry stops recovery.
Changed tools, revoked authority, exhausted budget, or unsafe adapters require
review. Advice is a snapshot, not authorization: the caller must invoke the
existing retry API with the expected version, and execution rechecks its own
permissions, inputs, dependencies, adapter identity, deadline and budget.

Hierarchical recovery retains the original method and task sequence. It cannot
replace a failed review with a shorter goal-only plan. General hierarchical
replanning remains unavailable until a method-preserving contract is reviewed.

Regression coverage exercises actual ordered execution after a rejected review,
unchanged encrypted bytes after advice, no replay of successful inspection,
unknown effects, revoked grants and host authorization, foreign project access,
changed adapter versions, and exhausted budgets. These are synthetic fixtures;
they do not establish production deployment or general coding competence.

## Consolidated installation

Keep existing releases and model checkpoints until the next consolidated archive
has passed its checks on the target host. Develop and test source changes on the
feature branch, then package a versioned archive with its SHA-256, exact source
revision, offline dependency requirements, test results and one installation
block. Extract into a new lab directory; preserve the currently working release.
Do not replace a live service, delete models, or promote training checkpoints as
part of lab installation. A completed test run does not close delivery gates.
