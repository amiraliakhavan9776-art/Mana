"""Independent furnished file validation. Does not import producing algorithms."""
import json,math
from pathlib import Path

def require(value,message):
 if not value:raise ValueError(message)

def bounds(r):
 for k in ['x','y','w','h']:require(type(r[k]) in (int,float) and math.isfinite(r[k]),'nonfinite_rectangle')
 require(r['w']>0 and r['h']>0,'nonpositive_rectangle')
 return (r['x'],r['y'],r['x']+r['w'],r['y']+r['h'])
def near(a,b):return all(math.isclose(x,y,abs_tol=1e-5) for x,y in zip(a,b))
def inside(a,b):return a[0]>=b[0]-1e-7 and a[1]>=b[1]-1e-7 and a[2]<=b[2]+1e-7 and a[3]<=b[3]+1e-7

def verify_export(directory):
 import ezdxf,fitz
 root=Path(directory)
 require(root.is_dir() and not root.is_symlink(),'invalid_directory')
 def file(name):
  p=root/name;require(p.is_file() and not p.is_symlink() and p.stat().st_size<=5000000,'invalid_file');return p
 model=json.loads(file('furnished-plans.json').read_text());plans=model['plans']
 require(model.get('schema')=='MANA_FURNISHED_CONCEPT_V1' and model.get('constructionApproved') is False,'invalid_scope')
 require(len(plans)==2 and {p['id'] for p in plans}=={'spine','gallery'},'exact_two_templates_required')
 signature=lambda p:sorted((r['id'],r['x'],r['y'],r['w'],r['h']) for r in p['rooms'])
 require(signature(plans[0])!=signature(plans[1]),'duplicate_variants')
 pdf=fitz.open(file('furnished-booklet.pdf'));require(len(pdf)==3,'three_pdf_pages_required')
 require('MANA furnished concepts' in pdf[0].get_text(),'missing_cover')
 total=0
 for index,p in enumerate(plans):
  rooms=p['rooms'];furniture=p['furniture'];site=(0,0,p['width'],p['length'])
  for key,lo,hi in [('width',12,20),('length',16,30),('wallHeight_m',2.4,4.5)]:require(type(p[key]) in (int,float) and math.isfinite(p[key]) and lo<=p[key]<=hi,'invalid_plan_dimension')
  require(p['unit']=='m' and p['width']==model['brief']['width'] and p['length']==model['brief']['length'] and p['wallHeight_m']==model['brief']['wallHeight'] and p['preference']==model['brief']['preference'] and p['preference'] in ['social','private'],'brief_mismatch')
  require(all(r['unit']=='m' for r in rooms+furniture),'invalid_unit')
  require(len(rooms)==7 and len(furniture)==14,'expected_room_and_furniture_inventory')
  require(len({r['id'] for r in rooms})==7 and len({r['id'] for r in furniture})==14,'duplicate_ids')
  rb={r['id']:bounds(r) for r in rooms};fb={f['id']:bounds(f) for f in furniture}
  for a in rb.values():require(inside(a,site),'room_outside')
  for f in furniture:require(f['roomId'] in rb and f['roomId']!='corridor' and inside(fb[f['id']],rb[f['roomId']]),'furniture_outside_room')
  for collection in [list(rb.values()),list(fb.values())]:
   for i,a in enumerate(collection):
    for b in collection[i+1:]:require(max(0,min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]))<1e-7,'overlap')
  require(math.isclose(sum((b[2]-b[0])*(b[3]-b[1]) for b in rb.values()),p['width']*p['length'],abs_tol=1e-6),'coverage')
  doc=ezdxf.readfile(file('furnished-'+p['id']+'.dxf'));require(not doc.audit().has_errors and doc.units==6,'invalid_dxf')
  polys=list(doc.modelspace().query('LWPOLYLINE'));require(len(polys)==21,'unexpected_polyline_inventory');seen=set()
  for poly in polys:
   pts=list(poly.get_points('xy'));require(poly.closed and len(pts)==4,'invalid_polyline')
   rectangle=(min(v[0] for v in pts),min(v[1] for v in pts),max(v[0] for v in pts),max(v[1] for v in pts))
   expected_corners={(rectangle[0],rectangle[1]),(rectangle[2],rectangle[1]),(rectangle[2],rectangle[3]),(rectangle[0],rectangle[3])};require(set(pts)==expected_corners,'not_rectangle')
   if poly.dxf.layer=='FURNITURE':
    tags=[t.value for t in poly.get_xdata('MANA_FURNITURE') if t.code==1000];require(len(tags)==3,'missing_furniture_tags');identifier,room,kind=tags
    f=next((f for f in furniture if f['id']==identifier),None);require(f is not None and f['roomId']==room and f['kind']==kind and near(rectangle,fb[identifier]),'furniture_model_mismatch');key='f:'+identifier
   else:
    tags=[t.value for t in poly.get_xdata('MANA_ROOM') if t.code==1000];require(len(tags)==1 and tags[0] in rb and poly.dxf.layer==tags[0] and near(rectangle,rb[tags[0]]),'room_model_mismatch');key='r:'+tags[0]
   require(key not in seen,'duplicate_dxf_entity');seen.add(key)
  dims=list(doc.modelspace().query('DIMENSION'));require(len(dims)==2 and near(sorted(d.get_measurement() for d in dims),sorted([p['width'],p['length']])),'dimension_mismatch')
  walls=list(doc.modelspace().query('LINE[layer=="WALL_CENTERLINES"]'))
  require(len(walls)==len(p['walls']),'wall_inventory')
  remaining=[(tuple(e.dxf.start)[:2],tuple(e.dxf.end)[:2]) for e in walls]
  for a,b in p['walls']:
   match=next((i for i,(x,y) in enumerate(remaining) if near(x,a) and near(y,b) or near(x,b) and near(y,a)),None)
   require(match is not None,'wall_coordinates');remaining.pop(match)
  markers={}
  for e in doc.modelspace().query('LINE'):
   if e.dxf.layer in ['DOORS','WINDOWS']:
    identifier=next(t.value for t in e.get_xdata('MANA_OPENING') if t.code==1000);require(identifier not in markers,'duplicate_opening');markers[identifier]=e
  require(len(markers)==len(p['openings'])==13,'opening_inventory')
  for o in p['openings']:
   e=markers[o['id']];require(near(tuple(e.dxf.start)[:2],o['a']) and near(tuple(e.dxf.end)[:2],o['b']),'opening_coordinates')
  page=pdf[index+1];text=page.get_text();require('Furnished '+p['id'] in text and 'NOT FOR CONSTRUCTION' in text,'pdf_identity_or_limit_missing')
  scale=min(338/p['width'],580/p['length']);ox,oy=45,112
  # Read actual filled vector rectangles from the PDF, not producer-reported counts.
  rects=[];pdf_lines=[]
  for drawing in page.get_drawings():
   fill=drawing.get('fill')
   for item in drawing['items']:
    if item[0]=='l':pdf_lines.append((tuple(item[1]),tuple(item[2])))
   if fill and near(fill,(.86,.76,.50)):
    for item in drawing['items']:
     if item[0]=='re':rects.append(tuple(item[1]))
  expected_lines=p['walls']+[[o['a'],o['b']] for o in p['openings']]
  require(len(pdf_lines)==len(expected_lines),'pdf_wall_opening_inventory')
  for a,b in expected_lines:
   ta=(ox+a[0]*scale,page.rect.height-(oy+a[1]*scale));tb=(ox+b[0]*scale,page.rect.height-(oy+b[1]*scale))
   close=lambda u,v:all(abs(x-y)<.002 for x,y in zip(u,v))
   match=next((i for i,(x,y) in enumerate(pdf_lines) if close(x,ta) and close(y,tb) or close(x,tb) and close(y,ta)),None)
   require(match is not None,'pdf_wall_opening_coordinates');pdf_lines.pop(match)
  require(len(rects)==len(furniture),'pdf_furniture_inventory')
  for f in furniture:
   target=(ox+f['x']*scale,page.rect.height-(oy+(f['y']+f['h'])*scale),ox+(f['x']+f['w'])*scale,page.rect.height-(oy+f['y']*scale))
   match=next((i for i,r in enumerate(rects) if all(abs(a-b)<.002 for a,b in zip(r,target))),None)
   require(match is not None and f['id'] in text,'pdf_furniture_coordinates_or_label');rects.pop(match)
  total+=len(furniture)
 pdf.close()
 return {'status':'FURNISHED_FILES_GEOMETRY_VERIFIED','plans':2,'furnitureItems':total,'pdfPlanPages':2,'scope':'footprint bounds/nonoverlap and JSON-DXF-PDF correspondence; not circulation or code approval'}

if __name__=='__main__':
 import sys
 print(json.dumps(verify_export(sys.argv[1])))
