# Facade pilot — runnable first prototype

This is a **schematic** geometry-and-quantity engine, not automatic Phase 2 engineering. It does **not** import DWG/PDF/images or create connection details. Inputs are manually structured JSON, in metres.

Run from repository root (Node.js 20+):

```sh
node mana-ai/facade-pilot.cjs mana-ai/examples/facade-pilot.example.json ./facade-output
node --test mana-ai/tests/facade-pilot.test.cjs
```

Generated files: `Sample_Facade.dxf` (editable R12 ASCII DXF geometry), `Sample_Facade.svg` (schematic sheet, NOT at fixed scale), `Sample_Facade.csv` (Excel-compatible itemized takeoff with opening deductions), `Sample_Facade.json` (machine-readable quantities).

Example gross 108 m²; openings 9.6 m²; net 98.4 m²; 10% waste => 108.24 m² order estimate. These are sample values, not verified procurement quantities.

The drawing and takeoff are drafts. No subframe/anchors/structural design, installation details, code compliance, or engineering approval is implied. Always have qualified personnel review geometry, calculations, facade detailing and procurement.
