'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {buildSyntheticDxfRevision,loadFixture}=require('../src/native/synthetic-dxf-revision-impact.cjs');
const {compareSyntheticDxf}=require('../src/native/synthetic-aec-dxf.cjs');
const {payloadDigest}=require('../src/approval-store.cjs');
const dir=path.resolve(__dirname,'../examples/synthetic-aec-dxf');
const native=files=>Object.fromEntries(files.map(([k,v])=>[k,fs.readFileSync(path.join(dir,v))]));
const args=[['floorBytes','floor-r1-r2.dxf'],['beforeFacadeBytes','south-facade-r1.dxf'],['afterFacadeBytes','south-facade-r2.dxf']];
const cli=(...args)=>spawnSync(process.execPath,[require.resolve('../src/native/synthetic-dxf-revision-impact.cjs'),...args],{encoding:'utf8',timeout:4000});
const status=x=>x.flags.map(f=>[f.id,f.status]);
const direct='STALE_DEPENDENCY_BINDING',indirect='UPSTREAM_CHANGE_REVIEW_REQUIRED';
test('genuine R1/R2 drawing hashes drive measured evidence and named direct/transitive review via native impact',()=>{
 const input=native(args),r=buildSyntheticDxfRevision(input);
 const sourceDelta=compareSyntheticDxf({revision:'R1',floorBytes:input.floorBytes,facadeBytes:input.beforeFacadeBytes},
  {revision:'R2',floorBytes:input.floorBytes,facadeBytes:input.afterFacadeBytes});
 assert.equal(r.source.dxfComparisonSha256,sourceDelta.reportSha256);
 assert.equal(r.measured.opening.beforeM2,'6');assert.equal(r.measured.opening.afterM2,'7.5');
 assert.deepEqual(r.measured.southNet,{beforeM2:'207',afterM2:'205.5',deltaM2:'-1.5'});
 assert.equal(r.measured.floorM2,'402');
 assert.equal(r.measured.opening.sourceBefore.sourceSha256,r.source.facadeBeforeSha256);
 assert.equal(r.measured.opening.sourceAfter.sourceSha256,r.source.facadeAfterSha256);
 assert.notEqual(r.measured.opening.sourceBefore.entitySha256,r.measured.opening.sourceAfter.entitySha256);
 assert.equal(r.evidence.artifactImpactSchema,'MANA_ARTIFACT_IMPACT_V1');
 assert.notEqual(r.evidence.beforeRegistrySha256,r.evidence.afterRegistrySha256);
 assert.deepEqual(r.evidence.sourcesToRecheck,['FACADE-SOUTH-001']);
 assert.deepEqual(status(r),[
  ['QTY-FACADE-001',direct],['COST-FACADE-001',indirect],['PROC-FACADE-001',indirect],['SCHED-FACADE-001',indirect],
  ['CONTRACT-FACADE-001',direct],['BOOKLET-FACADE-001',direct],['VISUAL-FACADE-001',direct],
 ]);
 const order=r.evidence.reviewOrder;
 assert.equal(new Set(order).size,7);
 for(const f of r.flags){
  assert.ok(f.reviewRequired);assert.equal(f.artifactWasRegenerated,false);
  for(const upstream of f.modeledDependencies.filter(id=>order.includes(id)))assert.ok(order.indexOf(upstream)<order.indexOf(f.id));
 }
 assert.equal(r.untouched.length,5);
 assert.equal(r.untouched[0].referenceOnly,false);
 assert.ok(r.untouched.slice(1).every(row=>row.referenceOnly&&row.status==='NO_DECLARED_LINK_TO_THIS_CHANGE'));
 assert.equal(r.actionsExecuted,0);assert.equal(r.approved,false);
 const {reportSha256,...unsigned}=r;
 assert.equal(reportSha256,payloadDigest(unsigned));
 assert.deepEqual(r,loadFixture());
});
test('refuses changed bytes, wrong revision or even syntactically identical unpinned variants, before reporting',()=>{
 const c=native(args),pin={code:'SYNTHETIC_DXF_FIXTURE_PIN_MISMATCH'};
 assert.throws(()=>buildSyntheticDxfRevision({...c,afterFacadeBytes:c.beforeFacadeBytes}),pin);
 assert.throws(()=>buildSyntheticDxfRevision({...c,beforeFacadeBytes:c.afterFacadeBytes,afterFacadeBytes:c.beforeFacadeBytes}),pin);
 const crlf=Buffer.from(c.afterFacadeBytes.toString('ascii').replaceAll('\n','\r\n'));
 assert.notEqual(crlf.length,c.afterFacadeBytes.length);
 assert.throws(()=>buildSyntheticDxfRevision({...c,afterFacadeBytes:crlf}),pin);
 assert.throws(()=>buildSyntheticDxfRevision({...c,floorBytes:Buffer.from('not-a-plan')}),pin);
 assert.throws(()=>buildSyntheticDxfRevision({...c,statePath:'arbitrary'}));
});
test('CLI structured or human output remains local, review-only and leaves fixture bytes intact',()=>{
 const before=native(args),machine=cli('json'),human=cli('markdown');
 assert.equal(machine.status,0);assert.equal(human.status,0);
 const r=JSON.parse(machine.stdout);assert.deepEqual(r,loadFixture());assert.match(human.stdout,new RegExp(r.reportSha256,'u'));
 for(const label of ['فقط برای بازبینی انسانی','هیچ خروجی وابسته‌ای بازتولید','هیچ نرخ یا مبلغی','هیچ سفارش','تأخیر یا مدت جدید اثبات نشده','جای‌نگهدارند'])
  assert.ok(human.stdout.includes(label));
 assert.doesNotMatch(human.stdout,/workspace|absolute|https?:/u);
 const blocked=cli('json',args[1][1]);
 assert.equal(blocked.status,1);assert.equal(JSON.parse(blocked.stdout).status,'ABSTAIN_NO_IMPACT_REPORT');
 assert.doesNotMatch(blocked.stdout,/flags|measured/u);
 assert.deepEqual(native(args),before);
});
