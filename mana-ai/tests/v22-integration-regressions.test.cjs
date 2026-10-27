'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {review}=require('../src/native/aec-quality-gate.cjs');
const {createJarvisAecBridge}=require('../src/native/jarvis-runtime-bridge.cjs');
const brief={projectId:'plot1',widthM:12,depthM:12,rooms:[{id:'living',widthM:3,depthM:4},{id:'bedroom',widthM:3,depthM:4}],adjacencies:[['living','bedroom']]};
const layout={schema:'MANA_AEC_LAYOUT_V1',projectId:'plot1',status:'FEASIBLE_SCHEMATIC_LAYOUT',rooms:[{id:'living',xM:0,yM:0,widthM:2,depthM:6},{id:'bedroom',xM:2,yM:0,widthM:2,depthM:6}],requiredAdjacencies:brief.adjacencies};
test('equal area does not substitute required room dimensions',()=>{const result=review({brief,layout});assert.equal(result.status,'REVIEW_REQUIRED');assert.equal(result.violations.filter(v=>v.code==='ROOM_DIMENSIONS_MISMATCH').length,2);});
test('actual 90 degree rotations remain eligible for schematic review',()=>{const candidate={...layout,rooms:[{id:'living',xM:0,yM:0,widthM:4,depthM:3},{id:'bedroom',xM:4,yM:0,widthM:4,depthM:3}]};assert.equal(review({brief,layout:candidate}).status,'SCHEMATIC_CHECKS_PASSED');});
test('omitted adjacency claims cannot weaken the original brief',()=>{const candidate={...layout,rooms:[{id:'living',xM:0,yM:0,widthM:3,depthM:4},{id:'bedroom',xM:3,yM:0,widthM:3,depthM:4}],requiredAdjacencies:[]};assert.ok(review({brief,layout:candidate}).violations.some(v=>v.code==='ADJACENCY_DECLARATION_MISMATCH'));});
test('raw runtime access still enforces project identity inside imported AEC tools',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-v22-scope-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const bridge=createJarvisAecBridge({file:path.join(dir,'state'),key:Buffer.alloc(32,7),authorize:()=>true}),project={id:'plot1',orgId:'org'},principal={id:'u',orgId:'org',role:'analyst',projectIds:['plot1'],capabilityIds:[...bridge.tools.map(t=>t.id),'native.mission.create']},foreign={...brief,projectId:'foreign'};
 assert.throws(()=>bridge.runtime.create({principal,project,objective:'Generate a reviewable draft',goals:['jarvis.report'],evidence:[],inputs:{'jarvis.aec.layout':foreign,'jarvis.aec.quality':foreign,'jarvis.aec.report':{format:'markdown'}},requestKey:'foreign'}),/Invalid tool input/);
});
