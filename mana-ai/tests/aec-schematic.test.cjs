'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {runBrief}=require('../src/native/aec-schematic.cjs');
const brief={projectId:'sample',widthM:20,depthM:12,currency:'IRR',unitCost:12000000,rooms:[{id:'living',label:'Living',areaM2:60},{id:'bed',label:'Bedroom',areaM2:24},{id:'kitchen',label:'Kitchen',areaM2:18}]};
test('native AEC: produces two distinct editable ASCII DXF documents and independently traceable takeoff',()=>{
 const r=runBrief(brief);assert.equal(r.report.alternatives.length,2);assert.equal(r.report.netProgramAreaM2,102);
 assert.equal(r.report.estimate.subtotal,'1224000000');assert.equal(r.report.estimate.currency,'IRR');
 assert.match(r.files['alternative_1.dxf'],/\n0\nSECTION\n/);assert.match(r.files['alternative_1.dxf'],/\n0\nEOF\n/);
 assert.notEqual(r.files['alternative_1.dxf'],r.files['alternative_2.dxf']);
 assert.equal(r.report.takeoff.reduce((s,x)=>s+x.quantity,0),102);
 assert.equal(r.report.takeoff.every(x=>x.verifiedFromGeometry===false),true);
 assert.ok(r.receipts['alternative_1.dxf'].length===64);
});
test('native AEC rejects impossible area, missing currency, unsafe names and malformed geometry',()=>{
 for(const change of [{rooms:[{id:'x',label:'X room',areaM2:900},{id:'z',label:'Z room',areaM2:22}]},{currency:'USD'},{widthM:0},{projectId:'../escape'}])assert.throws(()=>runBrief({...brief,...change}));
});
test('native AEC output is deterministic and no model/provider required',()=>{
 const a=runBrief(brief),b=runBrief(brief);assert.deepEqual(a.receipts,b.receipts);
});
test('native AEC valid fractional area with currency scaled exactly',()=>{
 const b={...brief,rooms:[{id:'a',label:'Room a',areaM2:10.25},{id:'b',label:'Room b',areaM2:3.75}],unitCost:1001};
 assert.equal(runBrief(b).report.estimate.subtotal,'14014');
});
