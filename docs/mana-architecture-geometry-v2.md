# Schematic architecture geometry v2 - development only

The same MANA mission runtime still executes design -> takeoff -> booklet, including Jarvis requests and revisions. No second executor, server installation or production change.

## New executable geometry

Two fixed rectangular alternatives now include seven room/corridor zones, six internal door openings, one entry opening and six exterior window openings. Generated wall centerlines are split at openings; collinear shared lines are merged to avoid duplicate wall segments. Separate DXF layers hold wall centerlines, doors, windows, room labels and two actual linear dimensions. Closed zone polygons remain available on hidden room layers for geometric takeoff. Opening IDs/heights and room IDs/heights/revisions are stored as DXF XDATA, so quantities can be independently reconstructed from the saved drawing.

Access checks require an outside-entry-corridor-door path to each room. Independent validation reads actual DXF opening markers, checks that their coordinates lie on each connected zone boundary and that wall lines do not span the openings. It does not accept a JSON `allRoomsReachable` assertion as proof. The normal tool output verifier now invokes the separate bounded geometry checker, not only file hashes. Removing a real door is rejected even after recomputing the claimed artifact hash.

## Inputs and revisions

`architecture.design` accepts width 8-30m, length 10-40m, optional wallHeight 2.4-4.5m (default 2.8m), optional integer revision 1-1000. The bounded Persian grammar recognizes explicit `ارتفاع ۳ متر`; ambiguous or unsupported height stops for clarification. Width/length remain explicitly required in metres.

A Jarvis revision creates a new mission referencing its predecessor and increments the geometry revision. Wall height is inherited unless the new request explicitly changes it. Stable room/opening IDs are retained within the corresponding option. Old files stay immutable; new takeoff points to the new DXF path/hash and revision. Existing finished artifacts are not relabelled or overwritten. An uncompleted mission whose provider fingerprint changed must be handled through the existing safe recovery controls; no silent use of changed tools.

## Quantity basis

Each room row retains floor area and adds perimeter, gross room-side wall surface, opening area and net room-side wall surface. Decimal calculations use explicit units. Surface = perimeter * supplied/default wall height minus connected door/window opening area. Shared partitions contribute one surface to each adjoining room. Summing these rows is a room-side finish-surface estimate, NOT wall volume, a unique partition quantity, facade area, labor/material cost or a full bill of quantities. Zone floor areas still omit wall thickness; they are not certified usable floor area.

To keep dependency payloads bounded, takeoff returns a hash-bound model-file reference rather than embedding another full copy of the model. The booklet verifies that reference before reading it. Provider fingerprints now include geometry and independent-verifier source hashes; immutable job keys also include provider configuration digest.

## Validation

Full combined Node suite: 185 passed locally. Real Python/DXF tests cover minimum, maximum and fractional dimensions, different wall heights, actual linear dimension measurements, bounds, non-overlap, doorway graph, room-side net surfaces, deleted-door corruption and Jarvis dimension/height revision. All run actual local geometry/file providers; generated inputs are regression cases, not real-project professional acceptance.

## Remaining limitations

This is a fixed two-bedroom schematic generator, not general architectural design. Wall thickness, setbacks, door leaf/swing clearance, accessibility, statutory egress/fire checks, structure, MEP, foundations, facade systems, local authority rules, CAD application review and licensed sign-off are not implemented. Opening markers are not a complete door/window construction detail. No BIM/IFC/DWG or rendering capability has been enabled. Full master-plan scope and the three real-project acceptance gates remain open. PR must stay Draft; merge/deploy require owner approval.
