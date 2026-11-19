# Local editable schematic DXF proof

Base: `28d330cc920fb374e92651b46f8b9af86f194a3a`. This increment adds a standalone
entry point to **existing** `artifact_worker.design` and its independent
`verify_artifacts.py`; it does not replace the native mission runtime or add a UI.

## Reproduce (CPU only)

Install the existing `requirements-artifacts.txt` into a Python virtual environment.
From the repository root:

```sh
python3 -m unittest discover -s mana-ai/tools -p test_schematic_plan.py -v
python3 mana-ai/tools/test_architecture_provider.py
python3 mana-ai/tools/schematic_plan.py \
  --brief mana-ai/examples/schematic-brief.json \
  --output /tmp/mana-schematic-proof-new
```

The output path must not already exist. No model, GPU, production service, or
network call is needed during generation. The example is synthetic: 12 × 20 m,
2.8 m room-side wall height. Both DXFs are metre-based R2010 editable linework,
not a rendered image. Their bytes can differ on repeated generation because DXF
metadata includes timestamps/identifiers; compare geometry, not binary equality.

## API / integration contract

```python
from schematic_plan import generate_schematic
receipt = generate_schematic(
    {'widthM': 12, 'depthM': 20, 'wallHeightM': 2.8},
    '/absolute/existing-parent/new-output-directory')
```

Only these three finite numeric keys are accepted. Width: 8–30 m; depth: 10–40 m;
wall height: 2.4–4.5 m. The JSON CLI also rejects duplicate keys. This CLI is for a
local trusted operator and does not add authentication or a deployment sandbox.

Outputs: `option-a.dxf`, `option-b.dxf`, `plans.json`, `receipt.json`. The receipt
records source and artifact SHA256, sizes, inputs, units, and explicit limitations.
Output publication follows independent file verification; unknown/failing geometry
is not reported as success. Existing outputs and symlink destinations are refused.

## Verified scope

- DXF audit, metre units, editable entities, expected drawing layers.
- Seven non-overlapping rectangular zones covering the rectangular footprint.
- Two dimension entities equal to the input footprint.
- Seven door and six window markers, openings on proper boundaries, no wall
  centerline through an opening, connected room/corridor schematic access graph.
- Three boundary sizes and detection of an actually deleted DXF door marker via
  the existing corruption test.
- Invalid/nonfinite/bool input, duplicate keys, existing output, and symlink refusal.

## Not delivered by this proof

The two alternatives are a fixed seven-zone template (living, kitchen, two bedrooms,
study, bathroom, corridor), not an arbitrary brief-to-design engine. There is no
wall thickness, construction detail, structural/MEP solution, accessibility/egress
code approval, permit design, 3D, DWG, IFC, or professional signoff. Labels remain
ASCII identifiers. It is a schematic engineering proof, not a complete MANA
Architect product and not construction-ready. Server installation not performed.
