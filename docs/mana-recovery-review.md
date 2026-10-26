# Independent review of corrective schedules

`createRecoveryReview` connects the corrective project planner to the existing
encrypted approval store. It supports requesting a review, an independent
decision, and checking whether a review is still current. It does not adopt a
baseline, claim an execution token, dispatch work or approve deployment.

Requests bind the complete recomputed proposal, its baseline digest, project,
action and schema version. Approval requires recomputing the proposal with the
reviewer's current permissions and matching the exact stored payload digest.
The approval store rejects self-approval and enforces its own host authorization,
expiry, status and encrypted transaction checks. Rejection remains possible
without recomputing an obsolete proposal.

Current-review receipts recheck project access, current host permissions,
expiry, decision status and the original approver's current authority. They
recompute the proposal against current evidence and remaining estimates.
Changed observations, estimates, capacities, monitoring time, horizon or baseline
invalidate the binding. Revoked evidence authority may refuse recomputation.
No receipt represents permission to execute or replace a live baseline.

Capabilities are `native.recovery.review.request`, `.approve` and `.read`.
The host authorizes `recovery.review.request`, `.approve`, `.read`, and
`.revalidate-approver`. Planner and monitor permissions remain required for
recomputation. Approval-store `read`, `request`, and `approve` authorization also
remains required. Production identity must resolve these from trusted host
records, not caller claims. The host should use the same trusted clock for both
the review service and approval store.

The generic approval store now exposes a read-authorized `inspect` method.
It neither changes status nor consumes approval. Its host policy must enforce
the record's project scope, as for the other approval-store operations.

Pass the review service as `review` to `createAuditedNativeServices` and expose
only its audited `request`, `decide`, and `current` methods to integrations.
Their intent/completion semantics and unresolved-commit behavior match the
existing audited service boundary. There is no public endpoint installed here.

Tests exercise the real scheduler, monitor, corrective planner and encrypted
approval store together, including restart, independent approval, changed data,
expiry, rejection, cancellation, revoked reviewer, permissions, foreign scope,
wrong approval type and audited calls. Host identity/evidence authority fixtures
are synthetic. Production baseline adoption and professional approval policies
remain separate open delivery work.
