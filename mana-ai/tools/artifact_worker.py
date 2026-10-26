"""Trusted, bounded local artifact provider; never evaluates supplied code."""
import sys,json,os,hashlib,tempfile,shutil,re,stat
from pathlib import Path
from decimal import Decimal

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read_pinned(row):
 p=Path(row['path']);s=p.lstat()
 if not stat.S_ISREG(s.st_mode) or s.st_size>200000: raise ValueError('source_not_regular_or_too_large')
 b=p.read_bytes()
 if hashlib.sha256(b).hexdigest()!=row['sha256']:raise ValueError('source_changed')
 if p.suffix.lower()=='.pdf':
  import fitz
  d=fitz.open(p)
  if len(d)>20:raise ValueError('page_limit')
  text='\n'.join(page.get_text() for page in d)
 elif p.suffix.lower()=='.txt':text=b.decode('utf8')
 else:raise ValueError('unsupported_source_type')
 if not text.strip():raise ValueError('ocr_required')
 return text

def pdf(target,title,lines,plans=None):
 from reportlab.pdfgen import canvas
 from reportlab.lib.pagesizes import A4
 c=canvas.Canvas(str(target),pagesize=A4);w,h=A4;y=h-48
 def heading():
  nonlocal y
  c.setFont('Helvetica-Bold',17);c.drawString(40,h-40,title);y=h-70
 heading();c.setFont('Helvetica',10)
 for line in lines:
  if y<55:c.showPage();heading();c.setFont('Helvetica',10)
  # Report labels intentionally English; no broken Persian shaping.
  for part in [str(line)[i:i+100] for i in range(0,len(str(line)),100)]:
   c.drawString(40,y,part);y-=15
 if plans:
  for plan in plans:
   c.showPage();c.setFont('Helvetica-Bold',16);c.drawString(40,h-40,plan['id']+' - schematic, not for construction')
   scale=min(450/plan['width'],620/plan['length']);ox,oy=65,85
   for r in plan['rooms']:
    c.rect(ox+r['x']*scale,oy+r['y']*scale,r['w']*scale,r['h']*scale)
    c.setFont('Helvetica',8);c.drawString(ox+r['x']*scale+3,oy+(r['y']+r['h']/2)*scale,r['id'])
   c.setFont('Helvetica',9);c.drawString(40,50,'Coordinates: metres; zones omit wall thickness, MEP, structure and local code review.')
 c.save()

def design(inp,out):
 import ezdxf
 w,l=inp['width'],inp['length']
 if type(w) not in (int,float) or type(l) not in (int,float) or not 8<=w<=30 or not 10<=l<=40:raise ValueError('unsupported_site_dimensions')
 plans=[];corridor=1.4;side=(w-corridor)/2
 for option,ratios in [('option-a',[0.40,0.28,0.32]),('option-b',[0.32,0.36,0.32])]:
  rooms=[];names=[['living','kitchen','bed-1'],['study','bath','bed-2']]
  for col in range(2):
   y=0
   for i,ratio in enumerate(ratios):
    height=round(l*ratio,6);rooms.append({'id':names[col][i],'x':0 if col==0 else side+corridor,'y':round(y,6),'w':side,'h':height,'unit':'m','revision':1});y+=height
  rooms.append({'id':'corridor','x':side,'y':0,'w':corridor,'h':l,'unit':'m','revision':1})
  plan={'id':option,'width':w,'length':l,'rooms':rooms,'unit':'m','revision':1,'limitations':['schematic zoning','zero wall thickness','no code/structure/MEP validation']}
  doc=ezdxf.new('R2010');doc.units=6;ms=doc.modelspace()
  for r in rooms:
   doc.layers.new(r['id']);x,y,rw,rh=r['x'],r['y'],r['w'],r['h']
   ms.add_lwpolyline([(x,y),(x+rw,y),(x+rw,y+rh),(x,y+rh)],close=True,dxfattribs={'layer':r['id']})
   ms.add_text(r['id'],dxfattribs={'height':.22,'insert':(x+.2,y+rh/2),'layer':r['id']})
  doc.saveas(out/(option+'.dxf'));plans.append(plan)
 (out/'plans.json').write_text(json.dumps(plans,indent=2));return {'plans':plans}

def takeoff(inp,out):
 plans=inp['plans'];rows=[]
 for p in plans:
  for r in p['rooms']:
   a=Decimal(str(r['w']))*Decimal(str(r['h']))
   rows.append({'option':p['id'],'element':r['id'],'revision':r['revision'],'formula':'width_m * depth_m','quantity':str(a),'unit':'m2','source':next(a['path'] for a in inp['drawingArtifacts'] if a['path'].endswith('/'+p['id']+'.dxf'))+'#'+r['id'],'sourceSha256':next(a['sha256'] for a in inp['drawingArtifacts'] if a['path'].endswith('/'+p['id']+'.dxf'))})
 (out/'takeoff.json').write_text(json.dumps(rows,indent=2));return {'rows':rows,'plans':plans}

def extract(inp,out):
 rows=[];seen=set()
 if not 1<=len(inp['sources'])<=20:raise ValueError('source_count')
 for src in inp['sources']:
  text=read_pinned(src).translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789'))
  fields={}
  for line in text.splitlines():
   if ':' in line:
    k,v=line.split(':',1);k=k.strip().lower()
    if k in fields:raise ValueError('duplicate_source_field')
    fields[k]=v.strip()
  if not {'id','type','invoice','amount','currency','date'}<=fields.keys():raise ValueError('unsupported_financial_document_schema')
  if fields['id'] in seen or fields['type'] not in ['invoice','payment'] or fields['currency'] not in ['IRR','IRT'] or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',fields['date']):raise ValueError('invalid_financial_document')
  from datetime import date
  date.fromisoformat(fields['date'])
  if not re.fullmatch(r'\d{1,12}',fields['amount']):raise ValueError('invalid_exact_integer_amount')
  if not re.fullmatch(r'[A-Za-z0-9_-]{1,60}',fields['id']) or not re.fullmatch(r'[A-Za-z0-9_-]{1,60}',fields['invoice']):raise ValueError('invalid_document_id')
  seen.add(fields['id']);rows.append({**fields,'amountIRR':str(int(fields['amount'])*(10 if fields['currency']=='IRT' else 1)),'sourceSha256':src['sha256'],'sourceName':Path(src['path']).name})
 (out/'extracted.json').write_text(json.dumps(rows,indent=2));return {'records':rows}

def reconcile(inp,out):
 records=inp['records'];invoices={};payments={};exceptions=[]
 for r in records:
  if r['type']=='invoice':
   if r['invoice'] in invoices:raise ValueError('ambiguous_duplicate_invoice')
   invoices[r['invoice']]=r
  else:payments.setdefault(r['invoice'],[]).append(r)
 rows=[]
 if not invoices:raise ValueError('invoice_source_required')
 for id,r in invoices.items():
  paid=sum(int(p['amountIRR']) for p in payments.get(id,[]));amount=int(r['amountIRR']);delta=paid-amount
  rows.append({'invoice':id,'invoiceIRR':str(amount),'paidIRR':str(paid),'differenceIRR':str(delta),'status':'matched' if delta==0 else 'overpaid' if delta>0 else 'unpaid_balance','sourceIds':[r['id']]+[p['id'] for p in payments.get(id,[])]})
 for id,ps in payments.items():
  if id not in invoices:exceptions.append({'kind':'orphan_payment','invoice':id,'documentIds':[p['id'] for p in ps]})
 result={'rows':rows,'exceptions':exceptions,'records':records,'currency':'IRR','note':'Unpaid balance is not proof of wrongdoing; cutoff, contract and timing need review.'}
 (out/'reconciliation.json').write_text(json.dumps(result,indent=2));return result

def main():
 req=json.loads(sys.stdin.read(100000));root=Path(req['root']).resolve(strict=True);action=req['action'];inp=req['input'];digest=hashlib.sha256(json.dumps(req,sort_keys=True).encode()).hexdigest();target=root/digest
 if action=='extract':
  for source in inp['sources']:read_pinned(source)
 if target.exists():
  if target.is_symlink():raise ValueError('unsafe_artifact_directory')
  result=json.loads((target/'receipt.json').read_text())
  for a in result['artifacts']:
   p=root/a['path']
   if p.is_symlink() or sha(p)!=a['sha256']:raise ValueError('artifact_changed')
  print(json.dumps(result));return
 stage=Path(tempfile.mkdtemp(prefix='.staging-',dir=root))
 try:
  if action=='design':data=design(inp,stage)
  elif action=='takeoff':data=takeoff(inp,stage)
  elif action=='extract':data=extract(inp,stage)
  elif action=='reconcile':data=reconcile(inp,stage)
  elif action=='booklet':
   data={'options':len(inp['plans']),'quantityRows':len(inp['rows'])};pdf(stage/'project-booklet.pdf','MANA Architectural Study',['Two geometric alternatives; preliminary floor-area takeoff only.','Not approved for construction. No walls, structure, MEP, permits or renderer claimed.']+[r['option']+' / '+r['element']+': '+r['quantity']+' '+r['unit'] for r in inp['rows']],inp['plans'])
  elif action=='audit_report':
   data={'invoices':len(inp['rows']),'exceptions':len(inp['exceptions'])};pdf(stage/'financial-audit.pdf','MANA Financial Reconciliation',['Amounts normalized to IRR; 1 IRT = 10 IRR.','Sources:']+[r['id']+' '+r['sourceName']+' SHA256 '+r['sourceSha256'] for r in inp['records']]+['Reconciliation:']+[r['invoice']+' invoice='+r['invoiceIRR']+' paid='+r['paidIRR']+' difference='+r['differenceIRR']+' '+r['status'] for r in inp['rows']]+[json.dumps(e) for e in inp['exceptions']]+[inp['note']]);(stage/'audit-data.json').write_text(json.dumps(inp,indent=2))
  else:raise ValueError('unknown_action')
  artifacts=[{'path':digest+'/'+p.name,'sha256':sha(p),'bytes':p.stat().st_size} for p in stage.iterdir() if p.is_file()]
  result={'schema':'MANA_ARTIFACT_RESULT_V1','data':data,'artifacts':artifacts};(stage/'receipt.json').write_text(json.dumps(result));os.rename(stage,target);print(json.dumps(result))
 finally:
  if stage.exists():shutil.rmtree(stage)
if __name__=='__main__':
 try:main()
 except Exception:print('artifact_provider_failed',file=sys.stderr);sys.exit(1)
