'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {inspectSyntheticDxf,compareSyntheticDxf}=require('../src/native/synthetic-aec-dxf.cjs');
const B=path.join(__dirname,'../examples/synthetic-aec-dxf');
const floorName=path.join(B,'floor-r1-r2.dxf'),facadeName=path.join(B,'south-facade-r1.dxf'),newName=path.join(B,'south-facade-r2.dxf');
const floorBytes=fs.readFileSync(floorName),facadeBytes=fs.readFileSync(facadeName),newBytes=fs.readFileSync(newName);
const r1={revision:'R1',floorBytes,facadeBytes},r2={revision:'R2',floorBytes,facadeBytes:newBytes};
const digest=b=>createHash('sha256').update(b).digest('hex');
const reported=(r,id)=>r.rows.find(x=>x.id===id);
function error(input,code){assert.throws(()=>inspectSyntheticDxf(input),{code});}
const replace=(b,find,to)=>{const s=b.toString();assert.ok(s.includes(find),find);return Buffer.from(s.replace(find,to));};
const all=(b,find,to)=>{const s=b.toString();assert.ok(s.includes(find),find);return Buffer.from(s.replaceAll(find,to));};
const cli=(...args)=>spawnSync(process.execPath,[require.resolve('../src/native/synthetic-aec-dxf.cjs'),...args],{encoding:'utf8',timeout:2000});

test('reads hashed DXF bytes, joins explicit south datum, and exactly computes hand-verified L-floor + façade with provenance',()=>{
 const r=inspectSyntheticDxf(r1);
 assert.equal(r.status,'SYNTHETIC_GEOMETRY_READBACK_REVIEW_REQUIRED');
 assert.equal(r.planSha256,digest(floorBytes));assert.equal(r.facadeSha256,digest(facadeBytes));
 assert.equal(r.planSha256,'4b6e6019945ee748fbd42a12daad06d9a91b3d5e790530f8dea089138efa87bf');
 assert.equal(r.facadeSha256,'2ea9e764f5747dea78c04b0eab27f0b4da789aa0ab78b8dd9b08afe85986994b');
 for(const [id,m2] of [['FLOOR.GROSS','402'],['SOUTH.GROSS','216'],['SOUTH.OPENING.21','6'],
  ['SOUTH.OPENING.22','3'],['SOUTH.DEDUCTIONS','9'],['SOUTH.NET','207']]){
  const x=reported(r,id);assert.equal(x.quantity.m2,m2);assert.equal(x.quantity.mm2,(BigInt(m2)*1000000n).toString());
  assert.ok(x.sources.every(s=>/^[a-f\d]{64}$/u.test(s.entitySha256)));
 }
 assert.equal(reported(r,'SOUTH.NET').sources.map(s=>s.handle).join(','),'20,21,22');
 assert.equal(reported(r,'SOUTH.NET').sources.every(s=>s.sourceSha256===r.facadeSha256),true);
 assert.equal(r.commercialUseAllowed,false);assert.equal(r.constructionApproved,false);assert.equal(r.networkRequests,0);
 assert.deepEqual(r,inspectSyntheticDxf(r1));
});
test('read-only revision compares raw pairs; only one primitive geometry changed, exact -1.5 m² net',()=>{
 const r=compareSyntheticDxf(r1,r2),get=id=>r.changes.find(x=>x.id===id);
 assert.equal(r.beforeReportSha256,inspectSyntheticDxf(r1).reportSha256);
 assert.equal(r.afterReportSha256,inspectSyntheticDxf(r2).reportSha256);
 assert.deepEqual(get('SOUTH.NET'),{id:'SOUTH.NET',beforeM2:'207',afterM2:'205.5',deltaM2:'-1.5',sourceEntityChanged:true,change:'QUANTITY_CHANGED'});
 assert.equal(get('SOUTH.DEDUCTIONS').deltaM2,'1.5');
 assert.equal(get('SOUTH.OPENING.21').deltaM2,'1.5');
 for(const id of ['FLOOR.GROSS','SOUTH.GROSS','SOUTH.OPENING.22']){
  assert.equal(get(id).sourceEntityChanged,false);assert.equal(get(id).deltaM2,'0');
 }
 assert.throws(()=>compareSyntheticDxf(r2,r1),{code:'DXF_REVISION_ORDER_INVALID'});
});
test('fails closed on unavailable units, unconfirmed/unknown layer, open or curved geometry, duplicate handles',()=>{
 const mutants=[
  [replace(facadeBytes,'$INSUNITS\n 70\n4','$INSUNITS\n 70\n6'),'DXF_EXPLICIT_MILLIMETERS_REQUIRED'],
  [replace(facadeBytes,'  9\n$INSUNITS\n 70\n4\n',''),'DXF_EXPLICIT_MILLIMETERS_REQUIRED'],
  [replace(facadeBytes,'OPENING_CONFIRMED','OPENING_UNVERIFIED'),'DXF_UNKNOWN_OR_UNCONFIRMED_LAYER'],
  [replace(facadeBytes,' 70\n1',' 70\n0'),'DXF_CLOSED_STRAIGHT_POLYLINE_REQUIRED'],
  [replace(facadeBytes,' 20\n9000\n',' 20\n9000\n 42\n1\n'),'DXF_PROFILE_UNSUPPORTED'],
  [replace(facadeBytes,'  5\n22\n','  5\n21\n'),'DXF_HANDLE_MISSING_OR_DUPLICATE'],
  [replace(facadeBytes,' 10\n6000\n',' 10\n6000.001\n'),'DXF_INTEGER_COORDINATES_REQUIRED'],
  [replace(facadeBytes,'  0\nEOF','  0\nEOF\n  0\nSECTION'),'DXF_TRAILING_TAGS'],
  [replace(facadeBytes,'LWPOLYLINE','INSERT'),'DXF_PROFILE_UNSUPPORTED'],
  [Buffer.alloc(32769,0x20),'DXF_ASCII_BOUNDS_REQUIRED'],
 ];
 for(const [facadeBytes,code] of mutants)error({...r1,facadeBytes},code);
});
test('cross-datum, self-intersection, an out-of-bound opening or double-counting stop the pair',()=>{
 error({...r1,facadeBytes:all(facadeBytes,' 10\n24000\n',' 10\n25000\n')},'DXF_SOUTH_EDGE_DATUM_OR_SPAN_MISMATCH');
 error({...r1,facadeBytes:replace(facadeBytes,' 20\n3000\n',' 20\n13000\n')},'DXF_NON_ORTHOGONAL_OR_REDUNDANT_EDGE');
 const outside=all(facadeBytes,' 20\n3000\n',' 20\n13000\n');
 error({...r1,facadeBytes:outside},'DXF_OPENING_OUTSIDE_SUPPORTED_FACADE');
 const overlap=all(all(facadeBytes,' 10\n13000\n',' 10\n4500\n'),' 10\n14500\n',' 10\n5800\n');
 error({...r1,facadeBytes:overlap},'DXF_OVERLAPPING_OPENINGS');
 const bow=[[0,0],[24000,0],[24000,16000],[6000,16000],[6000,4000],[18000,4000],[18000,20000],[0,20000]];
 const prefix=floorBytes.toString().split(' 90\n')[0];
 const crossing=Buffer.from(prefix+' 90\n8\n 70\n1\n'+bow.map(([x,y])=>' 10\n'+x+'\n 20\n'+y+'\n').join('')+'  0\nENDSEC\n  0\nEOF\n');
 error({...r1,floorBytes:crossing},'DXF_SELF_INTERSECTION_OR_TOUCH');
});
test('CLI bounded local read only; no quantity if symlink or unverified opening and no input writes',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mana-dxf-fixture-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const accepted=cli('inspect','R1',floorName,facadeName);
 assert.equal(accepted.status,0);assert.deepEqual(JSON.parse(accepted.stdout),inspectSyntheticDxf(r1));
 const names=[path.join(root,'symlink.dxf'),path.join(root,'unknown.dxf')];
 fs.symlinkSync(facadeName,names[0]);
 fs.writeFileSync(names[1],replace(facadeBytes,'OPENING_CONFIRMED','OPENING_UNVERIFIED'));
 const old=fs.readFileSync(names[1]);
 for(const bad of names){
  const r=cli('inspect','R1',floorName,bad),f=JSON.parse(r.stdout);
  assert.equal(r.status,1);assert.equal(f.status,'ABSTAIN_NO_QUANTITY');assert.ok(!Object.hasOwn(f,'rows'));
  assert.doesNotMatch(r.stdout,new RegExp(root,'u'));
 }
 assert.deepEqual(fs.readFileSync(names[1]),old);
 assert.deepEqual(fs.readdirSync(root).sort(),['symlink.dxf','unknown.dxf']);
 assert.deepEqual(fs.readFileSync(floorName),floorBytes);
 assert.deepEqual(fs.readFileSync(facadeName),facadeBytes);
});
