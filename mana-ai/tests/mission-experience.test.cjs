'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createMissionRuntime}=require('../src/native/mission-runtime.cjs');
const {createMissionExperience}=require('../src/native/mission-experience.cjs');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-experience-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const project={id:'p',orgId:'o'},principal={id:'u',orgId:'o',role:'analyst',projectIds:['p','q'],capabilityIds:['inspect','native.mission.create','native.mission.read','native.mission.run','native.experience.write','native.experience.read','native.experience.delete']};
 const runtime=createMissionRuntime({file:path.join(dir,'mission'),key:Buffer.alloc(32,1),authorize:()=>true,tools:[{id:'inspect',title:'Inspect',requires:['source'],produces:['checked'],workUnits:1,risk:'read',version:'v1',validate:()=>true,validateDependencies:()=>true,run:async()=>({privateText:'PRIVATE_RESULT'}),verify:()=>true}]});
 const mission=runtime.create({principal,project,objective:'PRIVATE_OBJECTIVE',goals:['checked'],evidence:[{id:'e',orgId:'o',projectId:'p',key:'source',value:true,verification:'verified',source:'fixture'}],inputs:{inspect:{}},requestKey:'once'}).mission;
 let allowed=true;const config={file:path.join(dir,'experience'),key:Buffer.alloc(32,2),runtime,authorize:()=>true,verifyConsent:({record})=>allowed&&record.consentId==='consent'};
 return {dir,config,runtime,principal,project,ctx:{principal,project,missionId:mission.id},memory:createMissionExperience(config),revoke:()=>{allowed=false;}};
}
test('actual completed mission receipts survive restart without copying source or results',async t=>{
 const s=fixture(t);assert.throws(()=>s.memory.remember({...s.ctx,consentId:'consent'}),/completed/);await s.runtime.runNext(s.ctx);
 const stored=s.memory.remember({...s.ctx,consentId:'consent'});assert.equal(stored.stored,true);assert.equal(s.memory.remember({...s.ctx,consentId:'consent'}).stored,false);
 const rows=createMissionExperience(s.config).recall(s.ctx);assert.equal(rows.length,1);assert.equal(rows[0].executionAuthorized,false);assert.equal(rows[0].tasks[0].capabilityId,'inspect');assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_/);assert.doesNotMatch(fs.readFileSync(s.config.file).toString(),/consent|inspect/);
 s.revoke();assert.deepEqual(s.memory.recall(s.ctx),[]);assert.throws(()=>s.memory.remember({...s.ctx,consentId:'consent'}),/consent/);assert.equal(s.memory.forget(s.ctx).removed,1);
});
test('experience permissions, project isolation, capacity and deletion remain scoped',async t=>{
 const s=fixture(t);await s.runtime.runNext(s.ctx);s.memory.remember({...s.ctx,consentId:'consent'});
 assert.deepEqual(s.memory.recall({...s.ctx,project:{id:'q',orgId:'o'}}),[]);assert.equal(s.memory.forget({...s.ctx,project:{id:'q',orgId:'o'}}).removed,0);
 assert.throws(()=>s.memory.recall({...s.ctx,principal:{...s.principal,capabilityIds:[]}}),/denied/);
 assert.throws(()=>s.memory.recall({...s.ctx,project:{id:'foreign',orgId:'other'}}),/denied/);
 const limited=createMissionExperience({...s.config,maxRecords:1});assert.throws(()=>limited.remember({...s.ctx,principal:{...s.principal,id:'another'},consentId:'consent'}),/capacity/);
 assert.throws(()=>createMissionExperience({...s.config,authorize:()=>false}).recall(s.ctx),/denied/);
 assert.equal(s.memory.recall(s.ctx).length,1);assert.equal(s.memory.forget(s.ctx).removed,1);assert.deepEqual(s.memory.recall(s.ctx),[]);
});
