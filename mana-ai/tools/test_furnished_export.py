import json,tempfile,unittest
from pathlib import Path
import ezdxf,fitz
from furnished_export import export_concepts
from verify_furnished import verify_export

class ExportTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.out=Path(self.temp.name)
  self.brief={'width':12,'length':20,'wallHeight':2.8,'preference':'social'}
 def make(self):return export_concepts(self.brief,self.out)
 def test_real_formats_exact_geometry_and_receipt(self):
  plans=self.make();r=verify_export(self.out);self.assertEqual(r['furnitureItems'],28);self.assertEqual(r['pdfPlanPages'],2)
  receipt=json.loads((self.out/'furnished-receipt.json').read_text());self.assertEqual(len(receipt['files']),4);self.assertFalse(receipt['constructionApproved'])
  import hashlib
  for name,meta in receipt['files'].items():self.assertEqual(hashlib.sha256((self.out/name).read_bytes()).hexdigest(),meta['sha256'])
  pdf=fitz.open(self.out/'furnished-booklet.pdf');summary=pdf[0].get_text();pdf.close()
  for text in ('phase 2','TEST SAMPLE','AREA COMPARISON','47.7','240','not net usable or billable area'):
   self.assertIn(text,summary)
  self.assertNotEqual(plans[0]['rooms'],plans[1]['rooms'])
 def test_exact_takeoff_fractions_and_version_binding(self):
  self.brief.update(width=12.12346,length=20.1234,preference='social')
  self.make();model=json.loads((self.out/'furnished-plans.json').read_text());t=model['takeoff'];self.assertEqual([o['total_area_m2'] for o in t['options']],['243.965234964','243.965234964'])
  receipt=json.loads((self.out/'furnished-receipt.json').read_text());self.assertEqual(receipt['geometrySha256'],t['geometrySha256'])
  self.assertEqual(verify_export(self.out)['takeoffRows'],14)
  for option in t['options']:
   dxf=ezdxf.readfile(self.out/('furnished-'+option['planId']+'.dxf'))
   self.assertEqual(dxf.header.custom_vars.get('MANA_GEOMETRY_SHA256'),t['geometrySha256'])
  for source in ['furnished_takeoff.cjs','furnished-takeoff.cjs','floor-takeoff.cjs']:self.assertIn(source,receipt['sourceHashes'])
 def test_rejects_unsupported_precision_before_any_export(self):
  self.brief['width']=12.000001
  with self.assertRaisesRegex(ValueError,'native_exact_takeoff_rejected'):self.make()
  self.assertEqual(list(self.out.iterdir()),[])
 def test_rejects_wrong_native_area_in_model(self):
  self.make();p=self.out/'furnished-plans.json';model=json.loads(p.read_text());model['takeoff']['options'][0]['rows'][0]['area_m2']='0';p.write_text(json.dumps(model))
  with self.assertRaisesRegex(ValueError,'takeoff_report_mismatch'):verify_export(self.out)
 def test_rejects_wrong_pdf_room_cell(self):
  self.make();p=self.out/'furnished-booklet.pdf';doc=fitz.open(p);page=doc[0];rect=page.search_for('47.7')[0]
  page.add_redact_annot(rect,fill=(1,1,1));page.apply_redactions(graphics=0);page.insert_text((rect.x0,rect.y1-2),'47.8',fontsize=9);tmp=self.out/'replacement.pdf';doc.save(tmp);doc.close();tmp.replace(p)
  with self.assertRaisesRegex(ValueError,'pdf_room_takeoff_mismatch'):verify_export(self.out)
 def test_rejects_added_wrong_pdf_room_vector(self):
  self.make();p=self.out/'furnished-booklet.pdf';doc=fitz.open(p);page=doc[1];page.draw_rect(fitz.Rect(55,100,65,110),fill=(.90,.87,.77),color=None);tmp=self.out/'replacement.pdf';doc.save(tmp);doc.close();tmp.replace(p)
  with self.assertRaisesRegex(ValueError,'pdf_room_geometry_inventory'):verify_export(self.out)
 def test_rejects_unbound_dxf(self):
  self.make();p=self.out/'furnished-spine.dxf';doc=ezdxf.readfile(p);doc.header.custom_vars.remove('MANA_GEOMETRY_SHA256');doc.saveas(p)
  with self.assertRaisesRegex(ValueError,'dxf_geometry_version_mismatch'):verify_export(self.out)
 def test_graphical_sample_has_embedded_fonts_labels_and_page_safe_text(self):
  self.make();pdf=fitz.open(self.out/'furnished-booklet.pdf')
  for page in pdf:
   self.assertIn('TEST SAMPLE',page.get_text())
   self.assertGreaterEqual(sum(f[2]=='TrueType' for f in page.get_fonts()),2)
   for block in page.get_text('dict')['blocks']:
    for line in block.get('lines',[]):
     for span in line['spans']:
      x0,y0,x1,y1=span['bbox'];self.assertGreaterEqual(x0,0);self.assertGreaterEqual(y0,0);self.assertLessEqual(x1,page.rect.width);self.assertLessEqual(y1,page.rect.height)
  for page in list(pdf)[1:]:self.assertIn('FURNITURE INDEX',page.get_text())
  pdf.close()
 def test_no_overwrite_or_symlink_output(self):
  self.make();before=(self.out/'furnished-spine.dxf').read_bytes()
  with self.assertRaises(ValueError):self.make()
  self.assertEqual(before,(self.out/'furnished-spine.dxf').read_bytes())
  alias=self.out/'alias';alias.symlink_to(self.out,target_is_directory=True)
  with self.assertRaises(ValueError):export_concepts(self.brief,alias)
 def test_missing_furniture_entity_is_detected(self):
  self.make();p=self.out/'furnished-spine.dxf';doc=ezdxf.readfile(p);ms=doc.modelspace();ms.delete_entity(next(e for e in ms.query('LWPOLYLINE') if e.dxf.layer=='FURNITURE'));doc.saveas(p)
  with self.assertRaises(ValueError):verify_export(self.out)
 def test_moved_furniture_entity_is_detected(self):
  self.make();p=self.out/'furnished-gallery.dxf';doc=ezdxf.readfile(p);next(e for e in doc.modelspace().query('LWPOLYLINE') if e.dxf.layer=='FURNITURE').translate(1,0,0);doc.saveas(p)
  with self.assertRaises(ValueError):verify_export(self.out)
 def test_missing_wall_is_detected(self):
  self.make();p=self.out/'furnished-spine.dxf';doc=ezdxf.readfile(p);ms=doc.modelspace();ms.delete_entity(next(iter(ms.query('LINE[layer=="WALL_CENTERLINES"]'))));doc.saveas(p)
  with self.assertRaises(ValueError):verify_export(self.out)
 def test_pdf_plan_with_text_but_no_furniture_is_detected(self):
  self.make();p=self.out/'furnished-booklet.pdf';doc=fitz.open(p);doc.delete_page(1);page=doc.new_page(pno=1);page.insert_text((40,40),'Furnished spine NOT FOR CONSTRUCTION');tmp=self.out/'replacement.pdf';doc.save(tmp);doc.close();tmp.replace(p)
  with self.assertRaises(ValueError):verify_export(self.out)
 def test_json_outside_room_or_same_variants_rejected(self):
  self.make();p=self.out/'furnished-plans.json';model=json.loads(p.read_text());model['plans'][0]['furniture'][0]['x']=-10;p.write_text(json.dumps(model))
  with self.assertRaises(ValueError):verify_export(self.out)

if __name__=='__main__':unittest.main()
