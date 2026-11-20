"""Independent furnished file validation. Does not import producing algorithms."""
import hashlib,json,math
from decimal import Decimal
from pathlib import Path

def require(value,message):
 if not value:raise ValueError(message)

def bounds(r):
 for k in ['x','y','w','h']:require(type(r[k]) in (int,float) and math.isfinite(r[k]),'nonfinite_rectangle')
 require(r['w']>0 and r['h']>0,'nonpositive_rectangle')
 return (r['x'],r['y'],r['x']+r['w'],r['y']+r['h'])
def near(a,b):return all(math.isclose(x,y,abs_tol=1e-5) for x,y in zip(a,b))
def inside(a,b):return a[0]>=b[0]-1e-7 and a[1]>=b[1]-1e-7 and a[2]<=b[2]+1e-7 and a[3]<=b[3]+1e-7

def _decimal_text(value):
 text=format(value,'f')
 return text.rstrip('0').rstrip('.') if '.' in text else text

def _dimension(value):
 require(type(value) in (int,Decimal),'invalid_exact_geometry_number')
 value=Decimal(value)
 require(value.is_finite() and 0<=value<=100 and value.as_tuple().exponent>=-6,'unsupported_exact_geometry_precision')
 return value

def _verify_takeoff(model):
 """Independently reconstruct exact room rectangles from parsed model decimals."""
 geometry=[];options=[]
 room_ids={'living','kitchen','study','bed-1','bed-2','bath','corridor'}
 for plan in model['plans']:
  require(plan['unit']=='m','takeoff_plan_unit')
  width,length=(_dimension(plan[k]) for k in ('width','length'))
  require(len(plan['rooms'])==7 and {r['id'] for r in plan['rooms']}==room_ids,'takeoff_room_inventory')
  rooms=[];rows=[];rects=[];total=Decimal(0)
  for room in plan['rooms']:
   require(room['unit']=='m','takeoff_room_unit')
   x,y,w,h=(_dimension(room[k]) for k in ('x','y','w','h'))
   require(w>0 and h>0 and x+w<=width and y+h<=length,'takeoff_room_bounds')
   require(all(x>=r or l>=x+w or y>=t or b>=y+h for l,b,r,t in rects),'takeoff_room_overlap')
   rects.append((x,y,x+w,y+h))
   area=w*h;total+=area
   rooms.append({'roomId':room['id'],'x_m':_decimal_text(x),'y_m':_decimal_text(y),'width_m':_decimal_text(w),'length_m':_decimal_text(h)})
   rows.append({'roomId':room['id'],'width_m':_decimal_text(w),'length_m':_decimal_text(h),'area_m2':_decimal_text(area)})
  require(total==width*length,'takeoff_exact_coverage')
  geometry.append({'planId':plan['id'],'width_m':_decimal_text(width),'length_m':_decimal_text(length),'rooms':rooms})
  options.append({'planId':plan['id'],'rows':rows,'total_area_m2':_decimal_text(total)})
 digest=hashlib.sha256(json.dumps(geometry,separators=(',',':')).encode()).hexdigest()
 expected={'schema':'MANA_FURNISHED_TAKEOFF_V1','geometrySha256':digest,'unit':'m2','scope':'concept_room_bands_zero_thickness_no_deductions','options':options}
 require(model.get('takeoff')==expected,'takeoff_report_mismatch')
 return expected

def _verify_pdf_takeoff(page,takeoff):
 words=page.get_text('words')
 def cell(x0,x1,y):
  return ' '.join(w[4] for w in sorted(words,key=lambda w:w[0])
   if x0<=w[0]<x1 and y-10<=(w[1]+w[3])/2<=y+2)
 require(cell(34,220,484)=='SPACE' and cell(270,410,484)=='SPINE / m2' and cell(430,page.rect.width,484)=='GALLERY / m2','pdf_takeoff_headers')
 areas=[{r['roomId']:r['area_m2'] for r in o['rows']} for o in takeoff['options']]
 for i,room in enumerate(('living','kitchen','study','bed-1','bed-2','bath','corridor'),1):
  y=484+20*i
  require(cell(34,220,y)==room.replace('-',' ').title() and cell(270,410,y)==areas[0][room] and cell(430,page.rect.width,y)==areas[1][room],'pdf_room_takeoff_mismatch')
 y=646
 require(cell(34,220,y)=='TOTAL FOOTPRINT' and cell(270,410,y)==takeoff['options'][0]['total_area_m2'] and cell(430,page.rect.width,y)==takeoff['options'][1]['total_area_m2'],'pdf_total_takeoff_mismatch')
 require(takeoff['options'][0]['total_area_m2']+' m2 footprint' in page.get_text(),'pdf_footprint_label_mismatch')

def verify_export(directory):
 import ezdxf,fitz
 root=Path(directory)
 require(root.is_dir() and not root.is_symlink(),'invalid_directory')
 def file(name):
  p=root/name;require(p.is_file() and not p.is_symlink() and p.stat().st_size<=5000000,'invalid_file');return p
 model_text=file('furnished-plans.json').read_text();model=json.loads(model_text);plans=model['plans']
 require(model.get('schema')=='MANA_FURNISHED_CONCEPT_V1' and model.get('constructionApproved') is False,'invalid_scope')
 require(len(plans)==2 and [p['id'] for p in plans]==['spine','gallery'],'exact_two_templates_required')
 takeoff=_verify_takeoff(json.loads(model_text,parse_float=Decimal))
 signature=lambda p:sorted((r['id'],r['x'],r['y'],r['w'],r['h']) for r in p['rooms'])
 require(signature(plans[0])!=signature(plans[1]),'duplicate_variants')
 pdf=fitz.open(file('furnished-booklet.pdf'));require(len(pdf)==3,'three_pdf_pages_required')
 require('Furnished concepts' in pdf[0].get_text() and 'TEST SAMPLE' in pdf[0].get_text(),'missing_cover_or_test_scope')
 require(all('GEOMETRY SHA256: '+takeoff['geometrySha256'] in page.get_text() for page in pdf),'pdf_geometry_version_mismatch')
 _verify_pdf_takeoff(pdf[0],takeoff)
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
  require(doc.header.custom_vars.get('MANA_GEOMETRY_SHA256')==takeoff['geometrySha256'] and doc.header.custom_vars.get('MANA_TAKEOFF_PLAN_ID')==p['id'],'dxf_geometry_version_mismatch')
  polys=list(doc.modelspace().query('LWPOLYLINE'));require(len(polys)==21,'unexpected_polyline_inventory');seen=set()
  for poly in polys:
   pts=list(poly.get_points('xy'));require(poly.closed and len(pts)==4 and not poly.has_arc,'invalid_polyline')
   require(all((a[0]==b[0]) != (a[1]==b[1]) for a,b in zip(pts,pts[1:]+pts[:1])),'nonorthogonal_polyline')
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
  rects=[];pdf_lines=[];room_rects=[]
  room_fills=[(.90,.87,.77),(.86,.89,.83),(.89,.88,.83),(.86,.90,.88),(.85,.90,.91),(.94,.93,.88)]
  for drawing in page.get_drawings():
   fill=drawing.get('fill')
   for item in drawing['items']:
    if item[0]=='l':pdf_lines.append((tuple(item[1]),tuple(item[2])))
   if fill and any(near(fill,color) for color in room_fills):
    for item in drawing['items']:
     if item[0]=='re':room_rects.append(tuple(item[1]))
   if fill and near(fill,(.86,.76,.50)):
    for item in drawing['items']:
     if item[0]=='re':rects.append(tuple(item[1]))
  close=lambda u,v:all(abs(x-y)<.002 for x,y in zip(u,v))
  expected_lines=p['walls']+[[o['a'],o['b']] for o in p['openings']]
  require(len(pdf_lines)==len(expected_lines),'pdf_wall_opening_inventory')
  for a,b in expected_lines:
   ta=(ox+a[0]*scale,page.rect.height-(oy+a[1]*scale));tb=(ox+b[0]*scale,page.rect.height-(oy+b[1]*scale))
   match=next((i for i,(x,y) in enumerate(pdf_lines) if close(x,ta) and close(y,tb) or close(x,tb) and close(y,ta)),None)
   require(match is not None,'pdf_wall_opening_coordinates');pdf_lines.pop(match)
  require(len(room_rects)==len(rooms),'pdf_room_geometry_inventory')
  def pdf_rectangle(r):
   return (ox+r['x']*scale,page.rect.height-(oy+(r['y']+r['h'])*scale),ox+(r['x']+r['w'])*scale,page.rect.height-(oy+r['y']*scale))
  for room in rooms:
   match=next((i for i,rect in enumerate(room_rects) if close(rect,pdf_rectangle(room))),None)
   require(match is not None,'pdf_room_geometry_mismatch');room_rects.pop(match)
  require(len(rects)==len(furniture),'pdf_furniture_inventory')
  for f in furniture:
   target=pdf_rectangle(f)
   match=next((i for i,r in enumerate(rects) if all(abs(a-b)<.002 for a,b in zip(r,target))),None)
   require(match is not None and f['id'] in text,'pdf_furniture_coordinates_or_label');rects.pop(match)
  total+=len(furniture)
 pdf.close()
 return {'status':'FURNISHED_FILES_GEOMETRY_VERIFIED','plans':2,'furnitureItems':total,'pdfPlanPages':2,'takeoffRows':14,'geometrySha256':takeoff['geometrySha256'],'scope':'footprint bounds/nonoverlap and JSON-DXF-PDF correspondence; not circulation or code approval'}

if __name__=='__main__':
 import sys
 print(json.dumps(verify_export(sys.argv[1])))
