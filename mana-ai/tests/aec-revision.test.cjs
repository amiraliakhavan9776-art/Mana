'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {state,proposeRevision}=require('../src/native/aec-revision.cjs');
const brief={projectId:'residence_pilot',widthM:20,depthM:12,currency:'IRR',unitCost:12000000,rooms:[{id:'living',label:'Living room',areaM2:60},{id:'bed',label:'Bedroom',areaM2:24},{id:'kitchen',label:'Kitchen',areaM2:18}]};
function apply(s,changes){return proposeRevision({current:s,expectedVersion:s.version,expectedSha256:s.sourceSha256,changes,actor:'chief_architect',reason:'Client requested schematic update'});}
test('revision propagates precise area, cost, invalidations and new DXF previews',()=>{
 const initial=state(brief);const r=apply(initial,[{elementId:'kitchen',field:'areaM2',value:22.5}]);
 assert.equal(r.nextState.version,2);assert.equal(r.impact.quantities.delta,'4.5');assert.equal(r.impact.cost.delta,'54000000');
 assert.equal(r.preview.report.netProgramAreaM2,106.5);assert.match(r.preview.files['alternative_1.dxf'],/\nEOF\n/);
 assert.equal(r.impact.invalidations.find(x=>x.artifact==='quantity_takeoff').invalidate,true);
 assert.equal(r.impact.invalidations.find(x=>x.artifact==='regulatory_review').invalidate,true);
 assert.equal(r.impact.automaticallyApproved,false);
 assert.equal(initial.brief.rooms[2].areaM2,18);assert.equal(brief.rooms[2].areaM2,18);
 assert.notEqual(r.nextState.sourceSha256,initial.sourceSha256);
});
test('label change invalidates DXF and booklet without changing quantities or money',()=>{
 const s=state(brief);const r=apply(s,[{elementId:'bed',field:'label',value:'Main bedroom'}]);
 assert.equal(r.impact.cost.delta,'0');assert.equal(r.impact.quantities.delta,'0');
 assert.equal(r.impact.invalidations.find(x=>x.artifact==='cost_estimate').invalidate,false);
 assert.equal(r.impact.invalidations.find(x=>x.artifact==='design_booklet').invalidate,true);
});
test('optimistic concurrency blocks stale modifications',()=>{
 const s=state(brief);assert.throws(()=>proposeRevision({current:s,expectedVersion:1,expectedSha256:'0'.repeat(64),changes:[{elementId:'bed',field:'areaM2',value:26}],actor:'chief_architect',reason:'Client requested update'}),/Stale/);
 const tampered={...s,brief:{...s.brief,unitCost:1}};
 assert.throws(()=>apply(tampered,[{elementId:'bed',field:'areaM2',value:26}]),/digest mismatch/);
});
test('rejects unknown room, duplicates, impossible envelope and unsafe instructions',()=>{
 const s=state(brief);
 for(const changes of [
  [{elementId:'missing',field:'areaM2',value:10}],
  [{elementId:'bed',field:'areaM2',value:500}],
  [{elementId:'bed',field:'areaM2',value:26},{elementId:'bed',field:'areaM2',value:27}],
  [{elementId:'bed',field:'admin',value:true}],
  [{elementId:'bed',field:'areaM2',value:26.123456}],
 ])assert.throws(()=>apply(s,changes));
});
test('multiple revisions maintain ancestry and reproducible output',()=>{
 const s=state(brief);const a=apply(s,[{elementId:'living',field:'areaM2',value:58.5}]);
 const b=apply(a.nextState,[{elementId:'bed',field:'areaM2',value:25}]);
 assert.equal(b.nextState.version,3);assert.equal(b.impact.parentSha256,a.nextState.sourceSha256);
 assert.deepEqual(apply(s,[{elementId:'living',field:'areaM2',value:58.5}]).preview.receipts,a.preview.receipts);
});
