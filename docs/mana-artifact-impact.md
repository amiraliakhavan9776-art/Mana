# Scoped artifact revision impact

`createArtifactImpact` compares two trusted project-registry snapshots and follows
declared dependencies from changed artifacts to downstream deliverables. It is
profession-agnostic; the sample registry links a facade, drawings, quantities,
estimate, schedule and booklet. It does not infer dependencies from CAD/BIM
geometry or discover unregistered relationships.

Each snapshot has one organization/project scope and up to 64 artifact records.
Each record declares an identifier, kind, version identifier, SHA-256, dependency
pins and mandatory approval/professional-signoff flags. Pins bind an upstream
identifier, version and content hash. At most 256 edges are accepted, subject to
the existing finite JSON/digest bounds. Records and pins are canonically sorted
so wire ordering alone is not a change.

The caller needs project access, `native.artifacts.impact` and host authorization
for `artifacts.impact`. The host must independently verify both canonical
snapshots, with their role (`before`/`after`) and exact digest, against trusted
registry history and current project records. A caller-supplied hash is not proof
of artifact validity, ownership, completeness or professional approval.

The prior registry must resolve all declared references; dependency cycles are
refused. Missing references in the new registry are reported as unresolved and
block downstream refresh. The impact search follows the union of old and new
consumer relationships, so deleting an edge cannot hide a previous dependency.
Impact propagation is conservative when topology changes.

Outputs include changed artifacts, stale pins, downstream causes, blocked
artifacts, source-review identifiers and a topological `refreshOrder` for current
unblocked derived deliverables. Refresh means independently verify or regenerate
through the existing tools. An artifact already rebuilt with current pins may
need only review; the analyzer never rewrites it automatically.

Mandatory approval/signoff requirements are retained from either snapshot for
affected records, even if the new metadata weakens them. The report asks for
rechecking; it does not revoke or alter records in the approval store. A changed
hash under an unchanged version is explicitly flagged for source-version review.
Removing an artifact is recorded as impact, not permission to delete a file.

The existing real DXF/takeoff/PDF integration test now maps independently checked
artifact receipts into declared registry relationships. It verifies that replacing
only drawing records marks old takeoff/booklet pins stale, while a fully rebuilt
revision has current pins and still needs review. Those schematic geometry tools
remain bounded prototypes, not approved construction documents or DWG/IFC support.

Pass this service as `artifactImpact` to the audited native facade and use
`artifactImpact.analyze` at host boundaries. Audit metadata contains digests rather
than registry bodies. No public endpoint or live registry migration is installed.

## Explicit local operator command

```bash
node mana-ai/analyze-impact.cjs "$PWD/mana-ai/examples/artifact-impact.json"
```

The example contains authored metadata and synthetic content hashes. The CLI
labels its lack of independent project/CAD/BIM verification. Real host integration
must use trusted registry authority and independently checked artifact receipts.
Tests cover dependency closure, unrelated records, edge deletion, weakened flags,
missing sources, version reuse, canonical ordering, cycles, denied scope, revoked
authority, audited delivery, the CLI and the existing real artifact workflow.
