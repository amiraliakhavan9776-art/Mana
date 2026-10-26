"""Geometry boundary/corruption tests using real DXF files, no mock CAD provider."""
import tempfile,json,hashlib,subprocess,sys
from pathlib import Path
import ezdxf
from artifact_worker import design,takeoff
verifier=Path(__file__).with_name('verify_artifacts.py')
for w,l,height in [(8,10,2.4),(12.125,20.5,3.0),(30,40,4.5)]:
 with tempfile.TemporaryDirectory() as tmp:
  root=Path(tmp);folder=root/('a'*64);folder.mkdir()
  models=design({'width':w,'length':l,'wallHeight':height,'revision':2},folder)
  assert all(p['revision']==2 and p['accessCheck']['allRoomsReachable'] for p in models['plans'])
  refs=[{'path':'a'*64+'/'+f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size} for f in folder.iterdir()]
  result=takeoff({**models,'drawingArtifacts':refs,'modelArtifact':next(a for a in refs if a['path'].endswith('/plans.json'))},folder)
  assert all(float(r['wallNet_m2'])>0 for r in result['rows'])
  p=subprocess.run([sys.executable,str(verifier),str(root)],capture_output=True,text=True);assert p.returncode==0,p.stdout+p.stderr
  # Removing one actual door must fail even when the JSON accessibility flag is true.
  target=folder/'option-a.dxf';doc=ezdxf.readfile(target);ms=doc.modelspace();door=next(e for e in ms.query('LINE') if e.dxf.layer=='DOORS');ms.delete_entity(door);doc.saveas(target)
  p=subprocess.run([sys.executable,str(verifier),str(root)],capture_output=True,text=True);assert p.returncode!=0,'Missing actual doorway was accepted'
print('3 boundary geometries, net surface checks and corrupted-door detection passed')
