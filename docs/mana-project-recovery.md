# Corrective project scheduling

`createProjectRecoveryPlanner` connects the existing evidence-bound project
monitor to the existing resource scheduler. It proposes a schedule for unfinished
work and leaves the source baseline unchanged. This is a planning API, not a
second mission executor or an automatic baseline-adoption mechanism.

The caller needs project access, `native.project.replan`,
`native.schedule.propose`, and the monitor's own current authorization. The host
provides current recovery authorization and verifies the exact remaining-estimate
payload digest, bound to the current baseline and assessment. Do not substitute
model-supplied booleans for these host checks.

The planner reassesses the original baseline and observations itself. It does
not accept an externally supplied status report as authority. Missing or stale
progress and unresolved predecessor completion stop scheduling. Verified complete
tasks are excluded; every unfinished task, including required reviews, remains.
Dependencies on completed work remain visible as `originalDependsOn`, while
unfinished dependencies constrain the new resource schedule. Approval and
professional-signoff flags are carried forward unchanged.

Each unfinished task needs an explicit remaining duration and resource demand.
The planner never infers remaining duration from a progress percentage. It uses
explicit current capacities and the same relative time unit as the baseline.
New task intervals begin at or after `asOf` and must fit the supplied future
horizon. An otherwise valid search without enough room returns no schedule.
Scheduling is deterministic heuristic planning; no global optimum is claimed.

The proposal includes baseline, assessment and estimate digests, completed task
identifiers, retained obligations, old and proposed finish times. Future work may
move earlier: no original release-date constraints are inferred. External date
constraints, active-worker commitments, procurement holds and actual calendar
availability must be reviewed separately before adopting any proposal. No crew
is reserved, work dispatched, financial record changed or approval consumed.

The chain is tested with actual scheduler output and actual monitor assessment,
using authored evidence/authority fixtures. Cases cover omitted completed work,
required review and signoff, immutable baseline, incomplete and contradictory
evidence, missing estimates, scope and permission denial, revoked estimates,
over-capacity demands, horizon exhaustion and no remaining work.

Production authority, audit connectors, concurrent baseline version adoption,
calendar integration and full company strategy remain open delivery work.
