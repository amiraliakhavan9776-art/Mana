"""Independent geometry/file checks; does not call the producing algorithms."""
import sys,json,math
from pathlib import Path
import ezdxf,fitz
root=Path(sys.argv[1]);count=0
for model in root.rglob('plans.json'):
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
  assert math.isclose(area,p['width']*p['length'],abs_tol=1e-6);count+=1
for takeoff in root.rglob('takeoff.json'):
 rows=json.loads(takeoff.read_text())
 for r in rows:
  import hashlib
  source,layer=r['source'].split('#');drawing=root/source
  assert hashlib.sha256(drawing.read_bytes()).hexdigest()==r['sourceSha256']
  poly=next(x for x in ezdxf.readfile(drawing).modelspace().query('LWPOLYLINE') if x.dxf.layer==layer)
  pts=list(poly.get_points('xy'));area=abs(sum(pts[i][0]*pts[(i+1)%4][1]-pts[(i+1)%4][0]*pts[i][1] for i in range(4)))/2
  assert math.isclose(area,float(r['quantity']),abs_tol=1e-7)
for pdf in root.rglob('*.pdf'):
 d=fitz.open(pdf);assert len(d)>0 and all(page.get_text().strip() for page in d)
print(json.dumps({'plans':count,'status':'independent_geometry_checks_passed'}))
