"""Opt-in fixed two-bedroom concepts in metres. Not construction/code approval."""
import math
from decimal import Decimal
from architecture_geometry import build_wall_segments, validate_access
LIMITATIONS = ['Fixed two-bedroom rectangular residential templates only.', 'Wall centre-lines have no thickness; furniture is approximate footprint geometry.', 'Door clearance and straight-line routes are heuristic flags, not accessibility or egress approval.', 'No site survey, structure, MEP, regulations or construction approval.']

def overlap(a,b):
 return min(a['x']+a['w'],b['x']+b['w'])-max(a['x'],b['x'])>1e-7 and min(a['y']+a['h'],b['y']+b['h'])-max(a['y'],b['y'])>1e-7

def contained(a,b):
 return a['x']>=b['x']-1e-7 and a['y']>=b['y']-1e-7 and a['x']+a['w']<=b['x']+b['w']+1e-7 and a['y']+a['h']<=b['y']+b['h']+1e-7

def validate_plan(p):
 bounds={'x':0,'y':0,'w':p['width'],'h':p['length']};rooms=p['rooms'];items=p['furniture'];warnings=[]
 for collection in [rooms,items]:
  if len({r['id'] for r in collection})!=len(collection):raise ValueError('duplicate_id')
  for r in collection:
   if any(type(r[k]) not in (int,float) or not math.isfinite(r[k]) for k in ['x','y','w','h']) or min(r['w'],r['h'])<=0:raise ValueError('invalid_rectangle')
  for i,a in enumerate(collection):
   for b in collection[i+1:]:
    if overlap(a,b):raise ValueError('overlap:'+a['id']+':'+b['id'])
 for r in rooms:
  if not contained(r,bounds):raise ValueError('room_outside')
 if abs(sum(r['w']*r['h'] for r in rooms)-p['width']*p['length'])>1e-6:raise ValueError('coverage')
 for a in items:
  room=next((r for r in rooms if r['id']==a['roomId']),None)
  if room is None or not contained(a,room):raise ValueError('furniture_outside_room')
 validate_access(p)
 for o in p['openings']:
  a,b=o['a'],o['b'];buffer={'x':min(a[0],b[0])-.6,'y':min(a[1],b[1])-.6,'w':abs(b[0]-a[0])+1.2,'h':abs(b[1]-a[1])+1.2}
  for f in items:
   if overlap(f,buffer):warnings.append({'kind':'opening_clearance_concern','openingId':o['id'],'furnitureId':f['id']})
 # Conservative bounding boxes around entry-to-room-centre routes; not pathfinding.
 for r in rooms:
  if r['id']=='corridor':continue
  o=next(o for o in p['openings'] if o['kind']=='door' and r['id'] in o['connects']);x,y=[sum(v)/2 for v in zip(o['a'],o['b'])];cx,cy=r['x']+r['w']/2,r['y']+r['h']/2
  route={'x':min(x,cx)-.3,'y':min(y,cy)-.3,'w':abs(x-cx)+.6,'h':abs(y-cy)+.6}
  for f in items:
   if f['roomId']==r['id'] and overlap(f,route):warnings.append({'kind':'straight_route_concern','roomId':r['id'],'furnitureId':f['id']})
 return {'boundsPassed':True,'nonOverlapPassed':True,'coveragePassed':True,'connectivityPassed':True,'concerns':warnings,'constructionApproved':False}

def generate_concepts(brief):
 if not isinstance(brief,dict) or set(brief)!={'width','length','wallHeight','preference'}:raise ValueError('explicit_supported_brief_required')
 for key,lo,hi in [('width',12,20),('length',16,30),('wallHeight',2.4,4.5)]:
  v=brief[key]
  if type(v) not in (int,float) or not math.isfinite(v) or not lo<=v<=hi:raise ValueError('unsupported_'+key)
 if brief['preference'] not in ['social','private']:raise ValueError('unsupported_preference')
 w,l=brief['width'],brief['length'];ratios=[.45,.30,.25] if brief['preference']=='social' else [.32,.28,.40];plans=[]
 for transverse in [False,True]:
  axis_exact=Decimal(str(w if transverse else l));side_exact=(Decimal(str(l if transverse else w))-Decimal('1.4'))/2
  axis=float(axis_exact);side=float(side_exact)
  p={'id':'gallery' if transverse else 'spine','width':w,'length':l,'wallHeight_m':brief['wallHeight'],'revision':1,'unit':'m','preference':brief['preference'],'reason':'Transverse gallery separates front social rooms from rear private rooms.' if transverse else 'Longitudinal spine gives every room independent central access.','limitations':LIMITATIONS,'rooms':[],'openings':[],'furniture':[]}
  p['preferencesApplied']={'bandFractions':ratios,'effect':'larger living/front band' if brief['preference']=='social' else 'larger final band; not a privacy performance assessment'}
  p['entrySide']='west' if transverse else 'south'
  names=[['living','kitchen','study'],['bed-1','bath','bed-2']] if transverse else [['living','kitchen','bed-1'],['study','bath','bed-2']]
  for col in range(2):
   cursor_exact=Decimal(0)
   for name,ratio in zip(names[col],ratios):
    span_exact=axis_exact*Decimal(str(ratio));span=float(span_exact);cursor=float(cursor_exact);off=0 if col==0 else float(side_exact+Decimal('1.4'))
    r={'id':name,'x':cursor if transverse else off,'y':off if transverse else cursor,'w':span if transverse else side,'h':side if transverse else span,'unit':'m','revision':1};p['rooms'].append(r)
    mid=cursor+span/2;wall=side if col==0 else side+1.4;outer=0 if col==0 else (l if transverse else w)
    for kind,at,width in [('door',wall,.9),('window',outer,.6 if name=='bath' else 1.2)]:
     points=[[mid-width/2,at],[mid+width/2,at]] if transverse else [[at,mid-width/2],[at,mid+width/2]]
     p['openings'].append({'id':kind+'-'+name,'kind':kind,'a':points[0],'b':points[1],'height_m':2.1 if kind=='door' else 1.2,'connects':['corridor',name] if kind=='door' else [name,'outside']})
    cursor_exact+=span_exact
  p['rooms'].append({'id':'corridor','x':0 if transverse else side,'y':side if transverse else 0,'w':w if transverse else 1.4,'h':1.4 if transverse else l,'unit':'m','revision':1})
  p['openings'].append({'id':'door-entry','kind':'door','a':[0,side+.2] if transverse else [side+.2,0],'b':[0,side+1.2] if transverse else [side+1.2,0],'height_m':2.1,'connects':['outside','corridor']})
  for r in p['rooms']:
   def put(kind,x,y,fw,fh):p['furniture'].append({'id':r['id']+'-'+kind,'kind':kind,'roomId':r['id'],'x':r['x']+x,'y':r['y']+y,'w':fw,'h':fh,'unit':'m'})
   if r['id']=='living':
    put('sofa',.2,.2,2.2,.85);put('coffee-table',.75,1.55,1.1,.6);put('armchair',.2,2.7,.8,.8)
   elif r['id'].startswith('bed-'):
    put('bed',.2,.2,1.6,2);put('wardrobe',r['w']-.8,.2,.6,1.8)
   elif r['id']=='kitchen':
    put('counter',.2,.2,2.4,.6);cx,cy=r['w']/2,r['h']/2
    put('dining-table',cx-.7,cy-.4,1.4,.8)
    for tag,dx,dy in [('n',-.225,.55),('s',-.225,-1),('e',.85,-.225),('w',-1.3,-.225)]:put('chair-'+tag,cx+dx,cy+dy,.45,.45)
   elif r['id']=='study':put('desk',.2,.2,1.4,.65)
  p['walls']=build_wall_segments(p);p['validation']=validate_plan(p);plans.append(p)
 return plans
