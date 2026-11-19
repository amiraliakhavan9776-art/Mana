"""Opt-in exact-model export. Fixed local providers; no network or supplied code."""
import hashlib, json, os, shutil, tempfile
from pathlib import Path
from furnished_concept import generate_concepts
from architecture_geometry import add_dxf_details


def export_concepts(brief, output):
 import ezdxf
 from reportlab.pdfgen import canvas
 from reportlab.lib.pagesizes import A4
 from verify_furnished import verify_export
 out=Path(output)
 if not out.is_dir() or out.is_symlink() or out.resolve()!=out.absolute():raise ValueError('real_existing_output_directory_required')
 plans=generate_concepts(brief)
 names=['furnished-'+p['id']+'.dxf' for p in plans]+['furnished-plans.json','furnished-booklet.pdf','furnished-receipt.json']
 if any((out/n).exists() or (out/n).is_symlink() for n in names):raise ValueError('output_exists')
 stage=Path(tempfile.mkdtemp(prefix='.furnished-',dir=out))
 try:
  for p in plans:
   doc=ezdxf.new('R2010');doc.units=6;ms=doc.modelspace()
   for r in p['rooms']:
    doc.layers.new(r['id']);x,y,w,h=[r[k] for k in ['x','y','w','h']]
    ms.add_lwpolyline([(x,y),(x+w,y),(x+w,y+h),(x,y+h)],close=True,dxfattribs={'layer':r['id']})
   add_dxf_details(doc,ms,p);doc.layers.new('FURNITURE',dxfattribs={'color':6});doc.appids.new('MANA_FURNITURE')
   for f in p['furniture']:
    x,y,w,h=[f[k] for k in ['x','y','w','h']]
    e=ms.add_lwpolyline([(x,y),(x+w,y),(x+w,y+h),(x,y+h)],close=True,dxfattribs={'layer':'FURNITURE'})
    e.set_xdata('MANA_FURNITURE',[(1000,f['id']),(1000,f['roomId']),(1000,f['kind'])])
    ms.add_text(f['kind'],dxfattribs={'height':.12,'insert':(x+.03,y+.03),'layer':'FURNITURE'})
   doc.saveas(stage/('furnished-'+p['id']+'.dxf'))
  model={'schema':'MANA_FURNISHED_CONCEPT_V1','brief':brief,'plans':plans,'constructionApproved':False,'inputClass':'user-declared-concept-not-survey'}
  (stage/'furnished-plans.json').write_text(json.dumps(model,ensure_ascii=False,indent=2),encoding='utf8')
  c=canvas.Canvas(str(stage/'furnished-booklet.pdf'),pagesize=A4);pw,ph=A4
  c.setFont('Helvetica-Bold',18);c.drawString(40,ph-55,'MANA furnished concepts')
  c.setFont('Helvetica',11)
  lines=['Two fixed residential templates, not a general design optimizer.','Preference: '+brief['preference'],'Furniture: 14 illustrative footprints per option, not product selections.','Bathroom fixtures and comprehensive interior furnishing are not included.','Wall centre-lines omit thickness; no code, structure or MEP approval.','Clearance/route flags are heuristic concerns, not a pass for safe use.','English artifact labels; the user interface may be Persian.','Partial phase 0 / phase 1 concept exercise only, not phase completion.','Out of scope: phase 2 execution drawings, structural/MEP design,','code approval, full BOQ, IFC/BIM, render, site survey and permits.']
  for i,line in enumerate(lines):c.drawString(40,ph-90-i*22,line)
  c.setFont('Helvetica-Bold',12);c.drawString(40,ph-326,'Concept area comparison | m2')
  c.setFont('Helvetica',9);c.drawString(40,ph-343,'Geometric room bands only. Not net usable or billable floor area.')
  y=ph-368
  for x,label in [(40,'Room'),(230,'Longitudinal spine'),(360,'Transverse gallery')]:c.drawString(x,y,label)
  areas=[{r['id']:r['w']*r['h'] for r in p['rooms']} for p in plans]
  for room in ('living','kitchen','study','bed-1','bed-2','bath','corridor'):
   y-=17;c.drawString(40,y,room);c.drawString(230,y,f'{areas[0][room]:.2f}');c.drawString(360,y,f'{areas[1][room]:.2f}')
  y-=19;c.setFont('Helvetica-Bold',9);c.drawString(40,y,'Total footprint');c.drawString(230,y,f'{sum(areas[0].values()):.2f}');c.drawString(360,y,f'{sum(areas[1].values()):.2f}')
  y-=25;c.setFont('Helvetica',9);c.drawString(40,y,'Option comparison assumes access is possible from both alternative entry edges.')
  for p in plans:
   c.showPage();c.setFont('Helvetica-Bold',15);c.drawString(40,ph-40,'Furnished '+p['id']+' | preference: '+p['preference'])
   c.setFont('Helvetica',9);c.drawString(40,ph-60,p['reason'])
   scale=min(338/p['width'],580/p['length']);ox,oy=45,112
   c.setLineWidth(.8);c.setStrokeColorRGB(0,0,0)
   for a,b in p['walls']:c.line(ox+a[0]*scale,oy+a[1]*scale,ox+b[0]*scale,oy+b[1]*scale)
   for opening in p['openings']:
    c.setStrokeColorRGB(0,.35,.75) if opening['kind']=='door' else c.setStrokeColorRGB(0,.65,.4)
    a,b=opening['a'],opening['b'];c.line(ox+a[0]*scale,oy+a[1]*scale,ox+b[0]*scale,oy+b[1]*scale)
   c.setStrokeColorRGB(.45,.25,.05);c.setFillColorRGB(.86,.76,.50)
   for f in p['furniture']:
    c.rect(ox+f['x']*scale,oy+f['y']*scale,f['w']*scale,f['h']*scale,fill=1,stroke=1)
   c.setFillColorRGB(0,0,0)
   c.setFont('Helvetica-Bold',9);c.drawString(405,ph-99,'FURNITURE KEY')
   for i,f in enumerate(p['furniture'],start=1):
    label=str(i);font_size=min(8,.72*f['h']*scale,.9*f['w']*scale/max(1,len(label)*.56))
    c.setFont('Helvetica-Bold',font_size)
    c.drawCentredString(ox+(f['x']+f['w']/2)*scale,oy+(f['y']+f['h']/2)*scale-font_size*.32,label)
    c.setFont('Helvetica',8);c.drawString(405,ph-111-14*i,f'{i:02d}  {f["id"]}')
   c.setFont('Helvetica',8)
   for r in p['rooms']:c.drawString(ox+(r['x']+.1)*scale,oy+(r['y']+r['h']-.25)*scale,r['id'])
   c.setFont('Helvetica',9);c.drawString(40,78,str(p['width'])+' x '+str(p['length'])+' metres; furniture footprints shown in ochre.')
   c.drawString(40,62,'Heuristic clearance/route concerns: '+str(len(p['validation']['concerns']))+' (see JSON for exact items).')
   c.drawString(40,46,'CONCEPT ONLY - NOT FOR CONSTRUCTION - NO REGULATORY APPROVAL')
  c.save()
  verification=verify_export(stage)
  dig=lambda b:hashlib.sha256(b).hexdigest()
  receipt={'schema':'MANA_FURNISHED_EXPORT_RECEIPT_V1','briefSha256':dig(json.dumps(brief,sort_keys=True,separators=(',',':')).encode()),'verification':verification,'constructionApproved':False,'productionDeploymentAllowed':False,'files':{n:{'sha256':dig((stage/n).read_bytes()),'bytes':(stage/n).stat().st_size} for n in names if n!='furnished-receipt.json'},'sourceHashes':{n:dig((Path(__file__).parent/n).read_bytes()) for n in ['furnished_concept.py','architecture_geometry.py','furnished_export.py','verify_furnished.py']}}
  (stage/'furnished-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf8')
  # No replacement. Partial publication on filesystem failure has no success return.
  for n in names:os.link(stage/n,out/n)
  return plans
 finally:shutil.rmtree(stage)

if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('--brief',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
 source=Path(args.brief)
 if source.is_symlink() or not source.is_file() or source.stat().st_size>4096:raise ValueError('bounded_regular_brief_required')
 plans=export_concepts(json.loads(source.read_text()),args.output)
 print(json.dumps({'status':'FURNISHED_CONCEPT_FILES_VERIFIED','plans':len(plans),'constructionApproved':False}))
