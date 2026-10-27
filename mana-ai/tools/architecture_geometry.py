"""Bounded rectangular schematic geometry. Units: metres; no regulatory claims."""
import math

def _segment_key(a,b):return tuple(sorted((tuple(round(v,7) for v in a),tuple(round(v,7) for v in b))))

def build_openings(plan):
 rooms=plan['rooms'];corr=next(r for r in rooms if r['id']=='corridor');openings=[]
 for r in rooms:
  if r['id']=='corridor':continue
  left=r['x']<corr['x'];x=corr['x'] if left else corr['x']+corr['w'];y=r['y']+r['h']/2
  openings.append({'id':'door-'+r['id'],'kind':'door','a':[x,round(y-.45,7)],'b':[x,round(y+.45,7)],'height_m':2.1,'connects':['corridor',r['id']]})
  width=.6 if r['id']=='bath' else 1.2;outer=0 if left else plan['width']
  openings.append({'id':'window-'+r['id'],'kind':'window','a':[outer,round(y-width/2,7)],'b':[outer,round(y+width/2,7)],'height_m':.6 if r['id']=='bath' else 1.2,'connects':[r['id'],'outside']})
 x=corr['x']+corr['w']/2;openings.append({'id':'door-entry','kind':'door','a':[round(x-.5,7),0],'b':[round(x+.5,7),0],'height_m':2.1,'connects':['outside','corridor']})
 return openings

def build_wall_segments(plan):
 segments={}
 for r in plan['rooms']:
  x,y,w,h=r['x'],r['y'],r['w'],r['h']
  for axis,at,start,end in [('x',y,x,x+w),('x',y+h,x,x+w),('y',x,y,y+h),('y',x+w,y,y+h)]:
   gaps=[]
   for opening in plan['openings']:
    a,b=opening['a'],opening['b'];dim=0 if axis=='x' else 1;fixed=1-dim
    if abs(a[fixed]-at)<1e-7 and abs(b[fixed]-at)<1e-7:
     lo,hi=sorted([a[dim],b[dim]])
     if hi>start and lo<end:gaps.append((max(start,lo),min(end,hi)))
   cursor=start
   for lo,hi in sorted(gaps)+[(end,end)]:
    if lo>cursor+1e-7:
     a=[cursor,at] if axis=='x' else [at,cursor];b=[lo,at] if axis=='x' else [at,lo];segments[_segment_key(a,b)]=[a,b]
    cursor=max(cursor,hi)
 # Union collinear shared boundaries to avoid duplicate overlapping wall lines.
 groups={}
 for a,b in segments.values():
  axis=0 if abs(a[1]-b[1])<1e-7 else 1;fixed=round(a[1-axis],7)
  groups.setdefault((axis,fixed),[]).append(tuple(sorted((a[axis],b[axis]))))
 result=[]
 for (axis,fixed),intervals in groups.items():
  merged=[]
  for lo,hi in sorted(intervals):
   if merged and lo<=merged[-1][1]+1e-7:merged[-1][1]=max(merged[-1][1],hi)
   else:merged.append([lo,hi])
  for lo,hi in merged:result.append([[lo,fixed],[hi,fixed]] if axis==0 else [[fixed,lo],[fixed,hi]])
 return result

def validate_access(plan):
 ids={r['id'] for r in plan['rooms']};graph={id:set() for id in ids|{'outside'}}
 if len(plan['openings'])!=13:raise ValueError('opening_count')
 for o in plan['openings']:
  a,b=o['a'],o['b'];length=math.dist(a,b)
  if length<=0 or o['height_m']<=0 or not all(0<=p[0]<=plan['width'] and 0<=p[1]<=plan['length'] for p in [a,b]):raise ValueError('invalid_opening')
  if o['kind']=='door':
   if length<.89:raise ValueError('door_too_narrow')
   one,two=o['connects'];graph[one].add(two);graph[two].add(one)
 reached={'outside'};todo=['outside']
 while todo:
  for dest in graph[todo.pop()]-reached:reached.add(dest);todo.append(dest)
 if not ids<=reached:raise ValueError('inaccessible_room')
 return {'allRoomsReachable':True,'basis':'schematic door connectivity only; not an egress code check'}

def add_dxf_details(doc,ms,plan):
 doc.appids.new('MANA_OPENING');doc.appids.new('MANA_ROOM')
 for room in plan['rooms']:
  poly=next(e for e in ms.query('LWPOLYLINE') if e.dxf.layer==room['id']);poly.set_xdata('MANA_ROOM',[(1000,room['id']),(1040,plan['wallHeight_m']),(1070,room['revision'])])
 for layer,color in [('WALL_CENTERLINES',7),('DOORS',3),('WINDOWS',5),('ROOM_LABELS',7),('DIMENSIONS',2)]:doc.layers.new(layer,dxfattribs={'color':color})
 for a,b in plan['walls']:ms.add_line(a,b,dxfattribs={'layer':'WALL_CENTERLINES'})
 for opening in plan['openings']:
  layer='DOORS' if opening['kind']=='door' else 'WINDOWS';a,b=opening['a'],opening['b'];line=ms.add_line(a,b,dxfattribs={'layer':layer});line.set_xdata('MANA_OPENING',[(1000,opening['id']),(1040,opening['height_m'])]);ms.add_text(opening['id'],dxfattribs={'height':.12,'insert':(a[0]+.05,a[1]+.05),'layer':layer})
 for r in plan['rooms']:
  doc.layers.get(r['id']).off()
  ms.add_text(r['id']+' '+str(round(r['w'],3))+'x'+str(round(r['h'],3))+'m',dxfattribs={'height':.20,'insert':(r['x']+.15,r['y']+r['h']/2),'layer':'ROOM_LABELS'})
 ms.add_linear_dim(base=(0,-.8),p1=(0,0),p2=(plan['width'],0),angle=0,dxfattribs={'layer':'DIMENSIONS'},override={'dimtxt':.2,'dimasz':.15}).render()
 ms.add_linear_dim(base=(plan['width']+.8,0),p1=(plan['width'],0),p2=(plan['width'],plan['length']),angle=90,dxfattribs={'layer':'DIMENSIONS'},override={'dimtxt':.2,'dimasz':.15}).render()
