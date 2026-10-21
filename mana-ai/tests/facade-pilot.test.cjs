'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {analyze,csv,dxf,svg}=require('../facade-pilot.cjs');
const sample={project:'Example',width:10,height:5,material:'Stone',wastePercent:10,openings:[{id:'W1',x:2,y:1,width:2,height:2}]};
test('calculates traceable facade net area and waste',()=>{
 const a=analyze(sample);assert.equal(a.gross,50);assert.equal(a.deductions,4);assert.equal(a.net,46);assert.equal(a.order,50.6);
 assert.match(csv(a),/Opening deduction/);assert.match(dxf(a),/AC1009/);assert.match(svg(a),/NOT FOR CONSTRUCTION/);
});
test('rejects openings outside facade',()=>assert.throws(()=>analyze({...sample,openings:[{x:9,y:1,width:2,height:1}]}),/outside/));
test('rejects overlapping openings',()=>assert.throws(()=>analyze({...sample,openings:[{x:1,y:1,width:2,height:2},{x:2,y:2,width:2,height:2}]}),/Overlapping/));
test('rejects invalid dimensions and waste',()=>{
 assert.throws(()=>analyze({...sample,width:-1}),/width/);
 assert.throws(()=>analyze({...sample,wastePercent:NaN}),/wastePercent/);
});
