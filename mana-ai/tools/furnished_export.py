"""Opt-in exact-model export. Fixed local providers; no network or supplied code."""
import hashlib, json, os, shutil, tempfile
from pathlib import Path
from furnished_concept import generate_concepts
from architecture_geometry import add_dxf_details


def render_booklet(target, brief, plans):
 """Styled vector report of MANA's exact model, not an illustrative replacement."""
 from reportlab.pdfgen import canvas
 from reportlab.lib.pagesizes import A4
 from reportlab.pdfbase import pdfmetrics
 from reportlab.pdfbase.ttfonts import TTFont
 import reportlab
 fonts=Path(reportlab.__file__).parent/'fonts'
 pdfmetrics.registerFont(TTFont('MANA-Regular',str(fonts/'Vera.ttf')))
 pdfmetrics.registerFont(TTFont('MANA-Bold',str(fonts/'VeraBd.ttf')))
 c=canvas.Canvas(str(target),pagesize=A4);pw,ph=A4
 c.setTitle('MANA | Furnished concepts | TEST SAMPLE');c.setAuthor('MANA deterministic concept exporter')
 ink=(.12,.22,.19);muted=(.36,.40,.35);paper=(.97,.96,.92);forest=(.16,.29,.24);gold=(.86,.76,.50)
 zone={'living':(.90,.87,.77),'kitchen':(.86,.89,.83),'study':(.89,.88,.83),'bed-1':(.86,.90,.88),'bed-2':(.86,.90,.88),'bath':(.85,.90,.91),'corridor':(.94,.93,.88)}
 def box(x,y,w,h,color):c.setFillColorRGB(*color);c.rect(x,y,w,h,fill=1,stroke=0)
 def text(x,y,value,size=10,font='MANA-Regular',color=ink):c.setFillColorRGB(*color);c.setFont(font,size);c.drawString(x,y,str(value))
 def right(x,y,value,size=10,font='MANA-Regular',color=ink):c.setFillColorRGB(*color);c.setFont(font,size);c.drawRightString(x,y,str(value))
 def background(number,section):
  box(0,0,pw,ph,paper);text(36,ph-35,'M A N A',12,'MANA-Bold');right(pw-36,ph-35,section,8,color=muted)
  box(36,ph-47,pw-72,.6,(.76,.78,.72));text(36,24,'TEST SAMPLE  /  CONCEPT ONLY  /  NOT FOR CONSTRUCTION',7,color=muted);right(pw-36,24,f'{number:02d} / 03',8,color=muted)
 def miniature(p,x,y,w,h):
  s=min(w/p['width'],h/p['length'])
  for r in p['rooms']:box(x+r['x']*s,y+r['y']*s,r['w']*s,r['h']*s,zone[r['id']])
  c.setStrokeColorRGB(*ink);c.setLineWidth(.45)
  for a,b in p['walls']:c.line(x+a[0]*s,y+a[1]*s,x+b[0]*s,y+b[1]*s)
  for f in p['furniture']:box(x+f['x']*s,y+f['y']*s,f['w']*s,f['h']*s,gold)
 background(1,'DESIGN LAB / MODEL OUTPUT')
 box(36,ph-245,pw-72,180,forest)
 text(54,ph-91,'TEST SAMPLE',10,'MANA-Bold',gold)
 text(54,ph-132,'Furnished concepts',30,'MANA-Regular',paper)
 text(54,ph-157,'Two geometries. One explicit brief.',13,'MANA-Regular',paper)
 text(54,ph-186,f"{brief['width']} x {brief['length']} m  |  {brief['width']*brief['length']:.0f} m2 footprint  |  {brief['wallHeight']} m wall height",10,'MANA-Regular',paper)
 text(54,ph-212,'PREFERENCE INPUT: '+brief['preference'].upper(),9,'MANA-Bold',gold)
 # These miniatures use the exact plan coordinates, not generated imagery.
 text(36,ph-273,'01  LONGITUDINAL SPINE',10,'MANA-Bold');text(310,ph-273,'02  TRANSVERSE GALLERY',10,'MANA-Bold')
 for p,x in zip(plans,[36,310]):
  miniature(p,x,ph-413,220,125)
  text(x,ph-428,'Entry: '+p.get('entrySide','declared')+' / '+str(len(p['validation']['concerns']))+' heuristic concerns',8,color=muted)
 text(36,ph-460,'AREA COMPARISON',9,'MANA-Bold');right(pw-36,ph-460,'Geometric bands, not net usable or billable area',8,color=muted)
 y=ph-484;box(36,y-7,pw-72,22,forest)
 text(47,y,'SPACE',8,'MANA-Bold',paper);right(378,y,'SPINE / m2',8,'MANA-Bold',paper);right(pw-47,y,'GALLERY / m2',8,'MANA-Bold',paper)
 areas=[{r['id']:r['w']*r['h'] for r in p['rooms']} for p in plans]
 for i,room in enumerate(('living','kitchen','study','bed-1','bed-2','bath','corridor')):
  y-=20
  if i%2==0:box(36,y-6,pw-72,20,(.92,.92,.87))
  text(47,y,room.replace('-',' ').title(),9);right(378,y,f'{areas[0][room]:.2f}',9);right(pw-47,y,f'{areas[1][room]:.2f}',9)
 y-=22;text(47,y,'TOTAL FOOTPRINT',9,'MANA-Bold');right(378,y,f'{sum(areas[0].values()):.2f}',10,'MANA-Bold');right(pw-47,y,f'{sum(areas[1].values()):.2f}',10,'MANA-Bold')
 text(36,142,'TEST BOUNDARY',9,'MANA-Bold')
 for i,line in enumerate(['Partial phase 0 / phase 1 concept exercise only; not phase completion.',
  'Out of scope: phase 2 execution drawings, structure, MEP, code approval,',
  'full BOQ, IFC/BIM, render, site survey and permits. No client-ready claim.',
  '14 illustrative furniture footprints per option; bathroom fixtures not included.',
  'Different entry edges assumed accessible. Preference is not performance proof.']):text(36,127-i*13,line,8,color=muted)
 for number,p in enumerate(plans,start=2):
  c.showPage();background(number,'FURNISHED PLAN / '+p['id'].upper())
  text(36,ph-83,'Furnished '+p['id'],27,'MANA-Regular')
  text(36,ph-106,p['reason'],9,color=muted)
  text(36,ph-126,'PREFERENCE  '+p['preference'].upper()+'     |     ENTRY  '+p.get('entrySide','declared').upper(),8,'MANA-Bold')
  # Retained transform is independently checked against actual PDF vectors.
  scale=min(338/p['width'],580/p['length']);ox,oy=45,112
  for r in p['rooms']:box(ox+r['x']*scale,oy+r['y']*scale,r['w']*scale,r['h']*scale,zone[r['id']])
  c.setLineWidth(1.05);c.setStrokeColorRGB(*ink)
  for a,b in p['walls']:c.line(ox+a[0]*scale,oy+a[1]*scale,ox+b[0]*scale,oy+b[1]*scale)
  for o in p['openings']:
   c.setStrokeColorRGB(0,.35,.75) if o['kind']=='door' else c.setStrokeColorRGB(0,.65,.4)
   a,b=o['a'],o['b'];c.line(ox+a[0]*scale,oy+a[1]*scale,ox+b[0]*scale,oy+b[1]*scale)
  c.setStrokeColorRGB(.45,.25,.05);c.setFillColorRGB(*gold);c.setLineWidth(.6)
  for f in p['furniture']:c.rect(ox+f['x']*scale,oy+f['y']*scale,f['w']*scale,f['h']*scale,fill=1,stroke=1)
  text(405,ph-166,'FURNITURE INDEX',9,'MANA-Bold');text(405,ph-182,'14 editable footprints',8,color=muted)
  for i,f in enumerate(p['furniture'],start=1):
   label=str(i);size=min(8,.72*f['h']*scale,.9*f['w']*scale/max(1,len(label)*.56))
   c.setFillColorRGB(*ink);c.setFont('MANA-Bold',size);c.drawCentredString(ox+(f['x']+f['w']/2)*scale,oy+(f['y']+f['h']/2)*scale-size*.32,label)
   yy=ph-203-16*(i-1);text(405,yy,f'{i:02d}',8,'MANA-Bold');text(425,yy,f['id'],7.5,color=muted)
  for r in p['rooms']:text(ox+(r['x']+.1)*scale,oy+(r['y']+r['h']-.25)*scale,r['id'],7.5,'MANA-Bold')
  box(405,ph-505,150,54,(.91,.90,.83));text(414,ph-468,'OPENINGS',8,'MANA-Bold');text(414,ph-484,'Blue: doors / green: windows',7.5,color=muted)
  text(405,ph-535,'GEOMETRY, NOT APPROVAL',7.5,'MANA-Bold')
  for i,line in enumerate(['Wall lines have zero thickness.','Furniture sizes are approximate.','No MEP or structural validation.','Review the JSON concern list.']):text(405,ph-552-i*13,line,7.5,color=muted)
  box(36,49,pw-72,46,(.91,.90,.83))
  text(47,78,f"{p['width']} x {p['length']} m  /  {len(p['furniture'])} furniture footprints  /  {len(p['validation']['concerns'])} clearance or route concerns",9,'MANA-Bold')
  text(47,62,'Heuristic concerns are not a safe-clearance pass. NOT FOR CONSTRUCTION.',8,color=muted)
 c.save()


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
  render_booklet(stage/'furnished-booklet.pdf',brief,plans)
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
