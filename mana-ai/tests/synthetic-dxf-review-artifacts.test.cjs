'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {makeArtifacts}=require('../src/native/synthetic-dxf-review-artifacts.cjs');
const {loadFixture}=require('../src/native/synthetic-dxf-revision-impact.cjs');
const exporter=require.resolve('../src/native/synthetic-dxf-review-artifacts.cjs');
const verifier=path.resolve(__dirname,'../tools/verify_synthetic_dxf_review.py');
const fixtureDir=path.resolve(__dirname,'../examples/synthetic-aec-dxf');
const python=process.env.MANA_DXF_REVIEW_PYTHON??'python3';
const sha=b=>createHash('sha256').update(b).digest('hex');
const run=(f,...args)=>spawnSync(process.execPath,[exporter,f,...args],{encoding:'utf8',timeout:5000});
function verify(t,files){
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'mana-synthetic-review-'));
 t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 const formats=['csv','svg','manifest'],targets=formats.map(x=>path.join(p,'review.'+x));
 for(const [i,f] of formats.entries())fs.writeFileSync(targets[i],f==='manifest'?JSON.stringify(files[f]):files[f],{mode:0o600});
 return spawnSync(python,['-B',verifier,...targets],{encoding:'utf8',timeout:5000});
}
function independentlyRehashed(original,type,value){
 const out={...original,[type]:value,manifest:structuredClone(original.manifest)};
 const row=out.manifest.artifacts.find(x=>x.type===type);
 row.sha256=sha(value);row.bytes=Buffer.byteLength(value);return out;
}
const fixtureSnapshot=()=>Object.fromEntries(fs.readdirSync(fixtureDir).filter(n=>n.endsWith('.dxf')).sort().map(n=>{
 const p=path.join(fixtureDir,n);return [n,[fs.statSync(p).mtimeMs,sha(fs.readFileSync(p))]];
}));
test('stdout-only regenerated CSV and SVG are deterministic and bound to exact read-only DXF impact evidence',()=>{
 const state=fixtureSnapshot(),a=makeArtifacts();
 assert.deepEqual(a,makeArtifacts());
 assert.equal(a.manifest.impactReportSha256,loadFixture().reportSha256);
 assert.equal(a.manifest.downstreamArtifactsRegenerated,false);
 for(const {type,sha256,bytes} of a.manifest.artifacts){
  assert.equal(sha(a[type]),sha256);assert.equal(Buffer.byteLength(a[type]),bytes);
  const got=run(type);
  assert.equal(got.status,0);assert.equal(got.stderr,'');assert.equal(got.stdout,a[type]);
 }
 assert.deepEqual(JSON.parse(run('manifest').stdout),a.manifest);
 const wrong=run('svg','/tmp/unsafe-output.svg');
 assert.equal(wrong.status,1);assert.equal(wrong.stdout,'');
 assert.deepEqual(fixtureSnapshot(),state);
});
test('independent Python reopen reconstructs the real raw fixture and validates 18 CSV rows and 7 SVG polygons',t=>{
 const r=verify(t,makeArtifacts());
 assert.equal(r.status,0,r.stderr+' '+r.stdout);
 assert.deepEqual(JSON.parse(r.stdout),{status:'SYNTHETIC_REPRESENTATIONS_VERIFIED',csv_rows:18,svg_source_polygons:7,
  facade_net_m2:['207','205.5'],facade_net_delta_m2:'-1.5',floor_m2:'402',changed_openings:['21']});
});
test('rehashing forged output cannot conceal wrong geometry, net, floor, or visibility',t=>{
 const a=makeArtifacts(),mutants=[
  ['csv',a.csv.replace('"205.5","205500000"','"207","207000000"'),'csv_measure_mismatch'],
  ['csv',a.csv.replace('"402","402000000"','"0","0"'),'csv_measure_mismatch'],
  ['svg',a.svg.replace('6500,0 6500,3000','6400,0 6400,3000'),'svg_polygon_mismatch'],
  ['svg',a.svg.replace('width="500" height="3000" class="change"','width="501" height="3000" class="change"'),'svg_opening_overlay'],
  ['svg',a.svg.replace('Net 205.5 m²','Net 207 m²'),'svg_visible_label'],
  ['svg',a.svg.replace('</style>','.shell{visibility:hidden}</style>'),'svg_hidden_or_external_style'],
 ];
 for(const [type,mutant,reason] of mutants){
  assert.notEqual(mutant,a[type]);
  const r=verify(t,independentlyRehashed(a,type,mutant));
  assert.equal(r.status,1,r.stdout);
  assert.deepEqual(JSON.parse(r.stdout),{status:'ABSTAIN_REPRESENTATION_UNVERIFIED',reason});
 }
});
