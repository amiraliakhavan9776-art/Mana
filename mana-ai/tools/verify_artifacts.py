"""Independent geometry/file checks; does not call the producing algorithms."""
import sys,json,math
from pathlib import Path
import ezdxf,fitz
root=Path(sys.argv[1]);scope=Path(sys.argv[2]) if len(sys.argv)>2 else root;count=0
for model in scope.rglob('plans.json'):
 plans=json.loads(model.read_text())
 for p in plans:
  doc=ezdxf.readfile(model.parent/(p['id']+'.dxf'))
  if doc.audit().has_errors:raise ValueError('DXF audit failed')
  assert doc.units==6
  polys=list(doc.modelspace().query('LWPOLYLINE'));assert len(polys)==7
  area=0;rects=[]
  for poly in polys:
   assert poly.closed
   pts=list(poly.get_points('xy'));assert len(pts)==4
   a=abs(sum(pts[i][0]*pts[(i+1)%4][1]-pts[(i+1)%4][0]*pts[i][1] for i in range(4)))/2
   area+=a;xs=[v[0] for v in pts];ys=[v[1] for v in pts]
   assert min(xs)>=-1e-8 and min(ys)>=-1e-8 and max(xs)<=p['width']+1e-8 and max(ys)<=p['length']+1e-8
   rects.append((min(xs),min(ys),max(xs),max(ys)))
  for i,a in enumerate(rects):
   for b in rects[i+1:]:assert max(0,min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]))<1e-7
  dims=list(doc.modelspace().query('DIMENSION'));assert len(dims)==2
  assert all(math.isclose(a,b,abs_tol=1e-7) for a,b in zip(sorted(float(d.get_measurement()) for d in dims),sorted([p['width'],p['length']])))
  room_by_id={r['id']:r for r in p['rooms']};graph={key:set() for key in [*room_by_id,'outside']}
  def on_boundary(a,b,r):
   return ((abs(a[0]-b[0])<1e-7 and any(abs(a[0]-v)<1e-7 for v in [r['x'],r['x']+r['w']]) and min(a[1],b[1])>=r['y']-1e-7 and max(a[1],b[1])<=r['y']+r['h']+1e-7) or (abs(a[1]-b[1])<1e-7 and any(abs(a[1]-v)<1e-7 for v in [r['y'],r['y']+r['h']]) and min(a[0],b[0])>=r['x']-1e-7 and max(a[0],b[0])<=r['x']+r['w']+1e-7))
  markers={}
  for e in doc.modelspace().query('LINE'):
   if e.dxf.layer in ['DOORS','WINDOWS']:
    tags={t.code:t.value for t in e.get_xdata('MANA_OPENING')};assert tags[1000] not in markers;markers[tags[1000]]=e
  assert len(markers)==13
  wall_lines=list(doc.modelspace().query('LINE[layer=="WALL_CENTERLINES"]'))
  for o in p['openings']:
   marker=markers[o['id']];assert math.dist(tuple(marker.dxf.start)[:2],o['a'])<1e-7 and math.dist(tuple(marker.dxf.end)[:2],o['b'])<1e-7
   for room in o['connects']:
    rectangle=room_by_id[room] if room!='outside' else {'x':0,'y':0,'w':p['width'],'h':p['length']}
    assert on_boundary(o['a'],o['b'],rectangle)
   for wall in wall_lines:
    a,b=tuple(wall.dxf.start)[:2],tuple(wall.dxf.end)[:2];v=o['a'][0]==o['b'][0];dim=1 if v else 0;fixed=1-dim
    if abs(a[fixed]-o['a'][fixed])<1e-7 and abs(b[fixed]-o['a'][fixed])<1e-7:assert min(max(a[dim],b[dim]),max(o['a'][dim],o['b'][dim]))-max(min(a[dim],b[dim]),min(o['a'][dim],o['b'][dim]))<=1e-7
   if o['kind']=='door':
    a,b=o['connects'];graph[a].add(b);graph[b].add(a)
  reached={'outside'};todo=['outside']
  while todo:
   for nxt in graph[todo.pop()]-reached:reached.add(nxt);todo.append(nxt)
  assert set(room_by_id)<=reached
  assert math.isclose(area,p['width']*p['length'],abs_tol=1e-6);count+=1
for takeoff in scope.rglob('takeoff.json'):
 rows=json.loads(takeoff.read_text())
 for r in rows:
  import hashlib
  source,layer=r['source'].split('#');drawing=root/source
  assert hashlib.sha256(drawing.read_bytes()).hexdigest()==r['sourceSha256']
  poly=next(x for x in ezdxf.readfile(drawing).modelspace().query('LWPOLYLINE') if x.dxf.layer==layer)
  pts=list(poly.get_points('xy'));area=abs(sum(pts[i][0]*pts[(i+1)%4][1]-pts[(i+1)%4][0]*pts[i][1] for i in range(4)))/2
  assert math.isclose(area,float(r['quantity']),abs_tol=1e-7)
  roomdoc=ezdxf.readfile(drawing);tags={t.code:t.value for t in poly.get_xdata('MANA_ROOM')};height=tags[1040]
  perimeter=sum(math.dist(pts[i],pts[(i+1)%4]) for i in range(4));opening_area=0
  # Read opening heights and geometry from DXF, not the producing takeoff routine.
  x0,y0=min(p[0] for p in pts),min(p[1] for p in pts);x1,y1=max(p[0] for p in pts),max(p[1] for p in pts)
  for e in roomdoc.modelspace().query('LINE'):
   if e.dxf.layer not in ['DOORS','WINDOWS']:continue
   a,b=tuple(e.dxf.start)[:2],tuple(e.dxf.end)[:2]
   vertical=abs(a[0]-b[0])<1e-7
   belongs=(vertical and any(abs(a[0]-v)<1e-7 for v in [x0,x1]) and min(a[1],b[1])>=y0-1e-7 and max(a[1],b[1])<=y1+1e-7) or (not vertical and any(abs(a[1]-v)<1e-7 for v in [y0,y1]) and min(a[0],b[0])>=x0-1e-7 and max(a[0],b[0])<=x1+1e-7)
   if belongs:opening_area+=math.dist(a,b)*next(t.value for t in e.get_xdata('MANA_OPENING') if t.code==1040)
  assert math.isclose(perimeter,float(r['perimeter_m']),abs_tol=1e-6)
  assert math.isclose(perimeter*height-opening_area,float(r['wallNet_m2']),abs_tol=1e-6)
for pdf in scope.rglob('*.pdf'):
 d=fitz.open(pdf);assert len(d)>0 and all(page.get_text().strip() for page in d)
print(json.dumps({'plans':count,'status':'independent_geometry_checks_passed'}))
