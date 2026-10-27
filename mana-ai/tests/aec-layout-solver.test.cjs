'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validate,solve,generate,toDXF}=require('../src/native/aec-layout-solver.cjs');
const source=require('../examples/aec-layout.json');
const clone=x=>JSON.parse(JSON.stringify(x));
test('returns deterministic non-overlapping room rectangles with explicit shared walls',()=>{
 const x=solve(source);assert.equal(x.status,'FEASIBLE_SCHEMATIC_LAYOUT');assert.equal(x.rooms.length,4);
 assert.equal(x.validatedAdjacencies.length,2);
 for(const a of x.rooms){assert.ok(a.xM+a.widthM<=source.widthM);assert.ok(a.yM+a.depthM<=source.depthM);
  for(const b of x.rooms){if(a.id===b.id)continue;assert.ok(a.xM>=b.xM+b.widthM||b.xM>=a.xM+a.widthM||a.yM>=b.yM+b.depthM||b.yM>=a.yM+a.depthM);}}
 assert.deepEqual(x,solve(source));
});
test('DXF is generated only on valid layout with traceable hashes',()=>{
 const g=generate(source);assert.equal(g.report.status,'FEASIBLE_SCHEMATIC_LAYOUT');assert.match(g.files['layout.dxf'],/AC1009/);
 assert.match(g.sha256['layout.dxf'],/^[0-9a-f]{64}$/);assert.equal(g.files['layout.dxf'],toDXF(source,g.report));
});
test('rejects overlap of total programmed room area',()=>{
 const s=clone(source);s.widthM=5;s.depthM=5;assert.throws(()=>validate(s),/ROOM_AREA_EXCEEDS_ENVELOPE/);
});
test('rejects missing adjacency participants and self edges',()=>{
 for(const edge of [['living','missing'],['living','living']]){const s=clone(source);s.adjacencies=[edge];assert.throws(()=>validate(s),/Invalid adjacency/);}
});
test('rejects undeclared keys, duplicates, and fractional precision abuse',()=>{
 for(const mut of [x=>{x.bad=1},x=>{x.rooms[1].id='living'},x=>{x.rooms[0].widthM=4.00001}]){const s=clone(source);mut(s);assert.throws(()=>validate(s));}
});
test('bounded search never reports fake feasibility',()=>{
 const result=solve(source,{maxNodes:1});assert.equal(result.status,'SEARCH_BUDGET_EXHAUSTED');assert.equal(result.rooms.length,0);
});
test('constraints never silently dropped when no valid layout is found',()=>{
 const s=clone(source);s.widthM=10;s.depthM=10;s.adjacencies=[['living','kitchen'],['living','bedroom'],['living','bathroom'],['kitchen','bedroom'],['kitchen','bathroom'],['bedroom','bathroom']];
 const r=solve(s,{maxNodes:3000});assert.notEqual(r.status,'FEASIBLE_SCHEMATIC_LAYOUT');
});
