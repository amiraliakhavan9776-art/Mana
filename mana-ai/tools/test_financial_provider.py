import tempfile,subprocess,json,hashlib,sys
from pathlib import Path
worker=Path(__file__).with_name('artifact_worker.py')
with tempfile.TemporaryDirectory() as tmp:
 root=Path(tmp);src=[]
 for id,kind,amount,currency in [('i','invoice','10000000','IRR'),('p','payment','۶۰۰۰۰۰','IRT'),('q','payment','5000000','IRR')]:
  p=root/(id+'.txt');p.write_text(f'id: {id}\ntype: {kind}\ninvoice: INV-1\namount: {amount}\ncurrency: {currency}\ndate: 2026-10-01\n');src.append({'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 def run(action,input):
  r=subprocess.run([sys.executable,str(worker)],input=json.dumps({'root':str(root),'action':action,'input':input}),capture_output=True,text=True);assert r.returncode==0,r.stderr;return json.loads(r.stdout)
 extracted=run('extract',{'sources':src});assert extracted['data']['records'][1]['amountIRR']=='6000000'
 reconciled=run('reconcile',extracted['data']);assert reconciled['data']['rows'][0]['differenceIRR']=='1000000';assert reconciled['data']['rows'][0]['status']=='overpaid'
 report=run('audit_report',reconciled['data']);assert (root/report['artifacts'][0]['path']).is_file()
 # New request key prevents reuse of a prior completed extraction receipt.
 Path(src[0]['path']).write_text('changed')
 bad=subprocess.run([sys.executable,str(worker)],input=json.dumps({'root':str(root),'action':'extract','input':{'sources':src},'idempotencyKey':'new-read'}),capture_output=True,text=True);assert bad.returncode!=0
print('financial exact-value / source-integrity checks passed')
