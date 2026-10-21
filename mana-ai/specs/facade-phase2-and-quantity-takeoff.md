# Mana AI — Approved pilot requirements: facade Phase 2 + quantity takeoff

Status: **approved product requirements; not implemented**. Scope: first pilot on a real project, human-reviewed outputs.

## Inputs
- Approved plans, elevations, sections, and dimensions in DWG/DXF/PDF/image formats where feasible.
- Project coordinates/levels, materials, facade assembly, structural substrate, local regulations, and approved construction standards.
- Detect missing dimensions, conflicting drawings, unknown material specifications; request clarification rather than inventing data.

## Outputs
1. Editable CAD facade drawings: dimensioned elevations, sections, material setting-out, subframe layout, connection details, window interfaces, parapets, waterproofing and drainage details.
2. Sheet sets with title block, sheet index, drawing IDs, scale, revision log, and project metadata; export PDF and editable DXF first, DWG via a validated compatible workflow.
3. Traceable detailed quantity takeoff per element and drawing: dimensions, formula, gross/net area or length, opening deductions, units, material type, and source drawing/element reference.
4. Material bill of quantities and procurement list: net quantity, configurable waste factor, purchase unit/pack conversion, and order quantity; optional estimates only with supplied verified prices.
5. Editable Excel takeoff with formulas and traceability.
6. On an approved geometry/material revision, regenerate affected sheets and takeoff, show a before/after difference report and version references.

## Pilot acceptance criteria
- One actual facade pilot, compared with licensed technical staff's manually checked drawings and takeoff.
- No fabricated measurements or code compliance claims; uncertainty and unverified assumptions flagged.
- Revision consistency between drawings and takeoff verified.
- All structural anchors, subframe design, waterproofing, fire/life safety and regulated design require qualified engineer approval before construction.
- Do not use outputs for procurement or execution without technical review.

## Security and integration
- Organization/project-scoped access, signed-in users, immutable audit history, approval gates for sensitive exports/actions, versioning and independent backups.
- No direct exposure of cameras, design files or confidential company data to unauthorized users or external model providers.
- AI may prepare proposals and draft artifacts; consequential release requires authorized human approval.

## Suggested implementation stages
1. File ingestion, normalized facade geometry, source mapping and validation.
2. CAD generation and A1/A3 PDF sheet composition with editable DXF export.
3. Deterministic quantity calculation and Excel BOM with configurable waste factors.
4. Change tracking, diff-based recomputation, quality checks and engineering sign-off.
5. Additional facade systems and expanded BIM/DWG integrations.
