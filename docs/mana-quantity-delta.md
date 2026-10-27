# Exact scoped quantity revision comparison

`createQuantityDelta` compares two trusted quantity snapshots for one project
and the same explicit `scopeRef` (a declared work package or design alternative).
Mutually exclusive design options must be compared separately. The engine does
not infer comparable scope from room names or automatically combine alternatives.

Each snapshot declares a revision and up to 64 uniquely identified rows. Each row
has an exact unsigned decimal quantity, explicit unit, source reference and source
SHA-256. Supported units are m, m2, m3, count, hour and kg. Input limits follow
shared exact decimals: 24 integer and six fractional digits. Unsupported precision
is rejected rather than silently rounded.

The comparison identifies added/removed items, signed increases/decreases, unit
changes and changed source evidence with unchanged quantity. A unit substitution
has no numeric item delta and needs review; no conversion is inferred. A quantity
change under unchanged source evidence is explicitly marked for investigation.
Equivalent decimal textual scales do not invent differences.

Totals are grouped by declared unit and never merged across units. These totals
are reconciliation summaries, not cost bases: different work types can share a
unit but have different rates. Increases in one item and decreases in another
must not be netted into a contract variation or budget without item-level review.
The output identifies items requiring cost review but does not price them.

The caller needs `native.quantities.compare`, project access and host authorization
for `quantities.compare`. Both canonical snapshots need independent host authority
verification by role and exact digest, including their comparable scope and
source provenance. The module does not extract geometry or certify quantities.
Snapshot revision changes remain visible even when quantities are unchanged;
such a result does not preserve an unrelated prior approval automatically.

The existing real DXF/takeoff/PDF integration now compares actual room-area rows
for option-a across the two generated revisions, retaining the drawing hashes.
It checks a 40 m2 increase for that one schematic alternative. It does not sum
both mutually exclusive alternatives or claim construction-ready quantities.

Pass the service as `quantityDelta` to the audited native facade and call
`quantityDelta.compare`. No quantity file, contract, approval or financial entry
is changed. Existing finite JSON/digest bounds remain in force.

```bash
node mana-ai/compare-quantities.cjs "$PWD/mana-ai/examples/quantity-delta.json"
```

The local CLI uses explicitly supplied metadata and marks the lack of independent
geometry/project verification. The sample quantities and hashes are authored test
data. Tests cover signed exact differences, additions/removals, separate units,
unit substitutions, source-only changes, large decimal values, current authority,
scope, malformed data, audited delivery, the CLI and actual artifact revisions.
