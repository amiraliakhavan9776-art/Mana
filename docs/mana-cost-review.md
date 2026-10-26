# Independent review of costed recovery scenarios

`createCostReview` connects the actual rate-bound budget analysis to the existing
encrypted approval store. The trusted input selects one `scenarioId` and an
`analysis` object containing current planning data, alternatives, lower/upper
rate cards, time unit and ceiling. The service recomputes the analysis itself.
Caller-supplied reports or booleans do not establish eligibility.

Only a `WITHIN_ALL_MODELED_RATES` alternative can enter this review route.
Price-sensitive and already-over-budget alternatives require a separate explicit
risk/exception policy, which this prototype does not implement. Within-model
affordability is not a guarantee about actual spend or omitted cost categories.

The reviewed proposal binds the original baseline, complete analysis digest,
comparison and bound digests, both rate digests, selected scenario and exact cost
range. Review obligations and professional-signoff flags remain attached.
Changing any bound analysis data, even an unselected alternative, requires a new
review. A previously approved record remains historical evidence; its `current`
receipt does not remain valid automatically.

Review uses the shared `createProposalReview` protocol, also used by the existing
schedule-only recovery review. It retains independent-approver checks, exact
payload binding, scoped read authorization, expiry, cancellation, rejection and
current reviewer revalidation. The two review types have different action/schema
identities: schedule-only review cannot substitute for cost review.

The caller needs `native.recovery.cost.review.request`, `.approve` or `.read` as
appropriate, project access and corresponding host authorization under
`recovery.cost.review`. Current receipts additionally require host revalidation
of the original approver. Recomputing data also requires the existing planning,
monitoring, scenario, costing and bounds permissions. Approval-store authorization
remains independently enforced. Use one trusted clock for the services.

Pass the service as `costReview` to `createAuditedNativeServices` and expose only
audited `costReview.request`, `.decide` and `.current` to integrations. Intent,
completion and unresolved-write behavior follow the existing audit boundary.
Rates, ceiling and reviewer reasons are not placed in audit event bodies.

This is review of a conditional draft, not a funding reservation, financial
posting, payment, baseline adoption, professional signoff or live deployment.
The host must implement real financial roles and any required professional
approval policy before production use. No public endpoint is installed here.

Tests run the actual scheduling-to-cost-range chain with the encrypted approval
store. Coverage includes restart, self-approval denial, current independent
review, changed ceiling/rates, bounded-affordability eligibility, revoked rate
authority, reviewer revocation, expiry, cancellation, denied scope, separation
from schedule review and audited delivery. Identity and evidence callbacks in
these tests are authored fixtures, not production certification.
