# Evidence-bound project monitoring

`createProjectMonitor` assesses a verified resource schedule against independently
verified task-progress observations. It uses the existing scheduler output; it
does not create another execution runtime. The caller needs current project
access, `native.project.monitor` and host authorization. Host callbacks must
verify the current baseline and each exact observation digest against trusted
records. A callback that always returns true is suitable only for authored tests.

Inputs use explicit relative integer time units shared with the baseline.
`asOf`, freshness (`maxAge`, default 7 units), and delay tolerance (default 500
basis points, or 5 percentage points) are caller-defined. No calendar, weekend,
reporting period, staffing or contract terms are inferred.

Progress is expressed in basis points from 0 to 10,000. Planned progress uses
linear interpolation between each task's scheduled start and finish. All tasks
need positive explicit weights in a common progress metric. The weighted total
is rounded down to a basis point. This is a transparent progress comparison,
not earned-value analysis, a cash-flow calculation or a completion forecast.

Current observations identify delay and overdue work. Starting a task while its
predecessor lacks current verified completion raises a dependency-review issue.
Missing and stale observations remain unknown, never assumed to be zero or
complete. The actual aggregate stays null if any task lacks current evidence.
Duplicate, future-dated, foreign-project and unverified observations are refused.
Baseline timing and dependency consistency are validated after host verification.

The report includes baseline, observation and input digests, per-task variance
and prioritized corrective proposals. Evidence reconciliation comes before
schedule changes. Proposals never change resources, shift the baseline, approve
work, execute tools or alter financial records. A new schedule still needs
explicit estimates, available capacities and the existing review gates.

This is an isolated deterministic capability. Production evidence connectors,
audit integration and role/approval acceptance remain open. It does not provide
full company strategy or autonomous project management. Regression tests use
actual scheduler output and synthetic reviewed progress fixtures.
