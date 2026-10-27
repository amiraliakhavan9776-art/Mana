# Read-only legacy reconciliation increment

Baseline: 09c0d3dfa140d2a8bd4cacd7c2fbfeb3854ff70c. No server, production data, main branch, deployment or merge changed.

## Implemented

`mana-ai/src/legacy-reconciliation.cjs` compares two explicit `{databaseJson, attachments}` exports. `tools/reconcile-legacy.cjs BEFORE.json AFTER.json` is a read-only CLI: exit 0 for matching supported snapshots with no detected relationship violations, 2 for differences/violations, 1 for invalid or unsupported input. It never imports or overwrites either source.

Comparison includes all collection sets (including empty/unknown collections), record IDs/content, metadata/settings, original approval provenance and complete attachment records. Top-level collection row order and object key order are immaterial; nested array order remains significant. Original raw database digests are retained. Reports contain IDs and digests rather than raw confidential fields; reports still require access control.

The inspector rejects duplicate JSON keys, including escaped aliases, and numeric lexemes that would require decimal/exponent or unsafe-integer interpretation. Safe integer JSON numbers and exact decimal/large-integer strings are accepted. Unsupported representations must be quarantined for a reviewed mapping; no rounding, coercion, currency conversion or repair is invented. Known project/contract or cross-project contract violations prevent a pass even when both snapshots match.

This is a strict preservation check, not an approved migration mapping, full domain validator or financial audit. Attachment owner namespaces, all nested/industry relationships, historical schema versions, accounting invariants, live cutover and post-write recovery remain open. A passing report never creates a valid financial approval.

`tools/inventory-source.cjs` emits current tracked-source hashes and line-numbered dependency/environment candidates. Generated outputs are excluded to avoid self-reference. The committed `docs/generated/source-evidence.json` supersedes stale source enumeration for this increment; it does not close semantic G1. Regex candidates are explicitly incomplete and require review.

## Verification and gates

The baseline suite passed 185/185 locally before edits. Final local combined suite: 195 passed, zero failed/skipped, Node v24.22.1. Ten added regressions cover balanced per-record amount drift, large exact decimal strings, missing empty collections, changed approvals/currency, known broken relationships, attachment drift, duplicate IDs/keys, unsafe numeric lexemes, real encrypted backup round-trip, and CLI exit codes/non-mutation/nondisclosure. CI now compares generated source evidence against the checked-in manifest, failing on drift. Consult CI at the exact increment SHA for its separate results.

Local browser tests could not start: Chromium was absent and installation returned truncated ZIP downloads. This is an environment failure, not a browser pass. Existing GitHub browser workflow remains the separate execution path.

G1/G2 remain OPEN: complete semantic workflow mapping, historical migration mappings and domain-reviewed expected financial results are not supplied by source enumeration or these tests. No human gate approval inferred.

## Permitted development boundary

Before G1/G2 close, continue reversible source inventory, regressions, contract review, and isolated synthetic experiments that neither connect live data nor introduce a second authoritative executor. Such experiments cannot be used as evidence of gate closure or permission to activate them. Extending the deployable backend or connecting actual company/server data remains gated. Once G1/G2 evidence is complete, obtain the named review required by the delivery contract; production merge/deploy still requires explicit owner approval.
