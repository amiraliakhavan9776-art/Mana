# Reviewed mission experience memory

`createMissionExperience` connects to the existing mission runtime through its
authorized `get` method. It accepts only completed, same-project executions with
verified result digests and adapter fingerprints. Failed, pending, unknown and
cancelled missions cannot become successful experience records.

Storage uses the existing encrypted single-host transaction store. Records
contain task identifiers, tool fingerprints, result hashes, attempt counts,
mission version, scope, actor and a consent reference. Objective text, tool
inputs, evidence bodies and result contents are not copied. Hashes and metadata
can still be sensitive: treat this store as private company data.

Every operation requires a current host authorization callback plus its explicit
`native.experience.write`, `.read` or `.delete` capability. The host consent
callback must verify current consent for the exact record digest and scope;
caller-supplied consent identifiers alone are insufficient. Recall rechecks
consent and returns only the current actor's records in the current project.
Deletion is similarly scoped. Capacity exhaustion refuses writes instead of
silently evicting other users' records.

The API supplies advisory execution metadata. It does not infer reusable facts
from results, execute earlier tasks, authorize a new mission, train weights or
export a training dataset. A past result hash is not proof that old facts remain
valid. Any future reuse needs current evidence, adapter identity and permissions.

This module is an isolated prototype and has no public HTTP route or live
company-data integration. Host consent persistence, independent review policy,
executive audit integration and production identity gates remain open. Tests
exercise actual runtime completion, encrypted restart, deduplication, revocation,
permission denial, scope separation, bounded capacity and scoped deletion using
synthetic fixtures.
