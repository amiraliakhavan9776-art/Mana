"""Independent file-based acceptance of local schematic CLI, not code compliance."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import ezdxf
from schematic_plan import generate_schematic, validate_brief


class SchematicPlanTests(unittest.TestCase):
    def test_dxf_units_dimensions_layers_and_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'proof'
            receipt = generate_schematic({'widthM': 12, 'depthM': 20, 'wallHeightM': 2.8}, output)
            self.assertFalse(receipt['constructionApproved'])
            self.assertEqual(receipt['verification']['plans'], 2)
            self.assertEqual({a['name'] for a in receipt['artifacts']}, {'option-a.dxf', 'option-b.dxf', 'plans.json'})
            for artifact in receipt['artifacts']:
                data = (output / artifact['name']).read_bytes()
                self.assertEqual(artifact['sha256'], hashlib.sha256(data).hexdigest())
                self.assertEqual(artifact['bytes'], len(data))
            for name in ['option-a.dxf', 'option-b.dxf']:
                doc = ezdxf.readfile(output / name)
                self.assertEqual(doc.units, 6)  # INSUNITS metres
                self.assertFalse(doc.audit().has_errors)
                for layer in ['WALL_CENTERLINES', 'DOORS', 'WINDOWS', 'ROOM_LABELS', 'DIMENSIONS']:
                    self.assertIn(layer, doc.layers)
                ms = doc.modelspace()
                self.assertEqual(len(ms.query('LWPOLYLINE')), 7)
                self.assertEqual(len(ms.query('LINE[layer=="DOORS"]')), 7)
                self.assertEqual(len(ms.query('LINE[layer=="WINDOWS"]')), 6)
                self.assertEqual(sorted(d.get_measurement() for d in ms.query('DIMENSION')), [12, 20])
                # Editable geometry, not a raster import.
                self.assertEqual(len(ms.query('IMAGE')), 0)
            with self.assertRaisesRegex(ValueError, 'output_already_exists'):
                generate_schematic(receipt['input'], output)
            self.assertEqual(json.loads((output / 'receipt.json').read_text()), receipt)

    def test_bounds_and_unknown_brief_fields(self):
        good = {'widthM': 12, 'depthM': 20, 'wallHeightM': 2.8}
        for changes in [{'widthM': True}, {'widthM': float('nan')}, {'depthM': float('inf')},
                        {'widthM': 7.99}, {'depthM': 40.01}, {'wallHeightM': 2.39}, {'roomCount': 8}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_brief({**good, **changes})

    def test_invalid_brief_creates_no_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'bad'
            with self.assertRaises(ValueError):
                generate_schematic({'widthM': 1, 'depthM': 1, 'wallHeightM': 2.8}, target)
            self.assertFalse(target.exists())

    def test_cli_duplicate_keys_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            brief = root / 'brief.json'
            brief.write_text('{"widthM":12,"widthM":13,"depthM":20,"wallHeightM":2.8}')
            p = subprocess.run([sys.executable, str(Path(__file__).with_name('schematic_plan.py')),
                                '--brief', str(brief), '--output', str(root / 'out')], capture_output=True, text=True)
            self.assertEqual(p.returncode, 1)
            self.assertIn('duplicate_brief_key', p.stderr)
            self.assertFalse((root / 'out').exists())

    def test_symlink_destination_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'link'
            target.symlink_to(Path(tmp) / 'missing')
            with self.assertRaisesRegex(ValueError, 'output_already_exists'):
                generate_schematic({'widthM': 12, 'depthM': 20, 'wallHeightM': 2.8}, target)


if __name__ == '__main__':
    unittest.main()
