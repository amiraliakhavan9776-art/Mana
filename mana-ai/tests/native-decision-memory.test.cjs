'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createNativeCore}=require('../src/native/core.cjs');
const {createDecisionMemory}=require('../src/native/decision-memory.cjs');
const principal={id:'u',orgId:'org',role:'analyst',projectIds:['p'],capabilityIds:['native.memory.write','native.memory.read']},project={id:'p',orgId:'org'};
function fixture(run){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mana-decision-memory-')),key=Buffer.alloc(32,4);try{run({directory,key})}finally{fs.rmSync(directory,{recursive:true,force:true})}}
function decision(){return createNativeCore().plan({principal,project,objective:'طرح آزمایشی',goals:['ready'],evidence:[]})}
test('native decisions persist only with explicit consent and are deduplicated',()=>fixture(({directory,key})=>{
 const memory=createDecisionMemory({directory,key}),proposal=decision();
 assert.throws(()=>memory.remember({principal,project,decision:proposal}),/consent/);
 assert.equal(memory.remember({principal,project,decision:proposal,consent:true}).stored,true);
 assert.equal(memory.remember({principal,project,decision:proposal,consent:true}).stored,false);
 const recalled=createDecisionMemory({directory,key}).recall({principal,project});
 assert.equal(recalled.length,1);assert.deepEqual(recalled[0].decision,proposal);
 assert.equal(recalled[0].consent.granted,true);assert.equal(recalled[0].consent.actorId,principal.id);
 assert.equal(fs.readFileSync(path.join(directory,fs.readdirSync(directory)[0])).includes(Buffer.from('طرح آزمایشی')),false);
}));
test('decision memory isolates users, organizations and projects and rechecks grants',()=>fixture(({directory,key})=>{
 const memory=createDecisionMemory({directory,key});memory.remember({principal,project,decision:decision(),consent:true});
 assert.deepEqual(memory.recall({principal:{...principal,id:'other'},project}),[]);
 assert.deepEqual(memory.recall({principal:{...principal,orgId:'other'},project:{...project,orgId:'other'}}),[]);
 assert.throws(()=>memory.recall({principal:{...principal,projectIds:[]},project}),/access denied/);
 assert.throws(()=>memory.remember({principal:{...principal,capabilityIds:[]},project,decision:decision(),consent:true}),/access denied/);
 assert.throws(()=>memory.remember({principal,project,decision:{...decision(),actionsExecuted:1},consent:true}),/proposals/);
}));
test('retention is bounded and a wrong key cannot reset decision records',()=>fixture(({directory,key})=>{
 const memory=createDecisionMemory({directory,key,maxRecords:2});
 for(let i=0;i<3;i++)memory.remember({principal,project,decision:{...decision(),objective:'objective-'+i},consent:true});
 assert.deepEqual(memory.recall({principal,project}).map(r=>r.decision.objective),['objective-1','objective-2']);
 assert.throws(()=>createDecisionMemory({directory,key:Buffer.alloc(32,9)}).recall({principal,project}));
 assert.equal(memory.recall({principal,project}).length,2);
}));
test('forget requires a distinct grant and only clears the authenticated owner scope',()=>fixture(({directory,key})=>{
 const memory=createDecisionMemory({directory,key});memory.remember({principal,project,decision:decision(),consent:true});
 assert.throws(()=>memory.forget({principal,project}),/access denied/);
 assert.equal(memory.recall({principal,project}).length,1);
 const owner={...principal,capabilityIds:[...principal.capabilityIds,'native.memory.delete']};
 assert.deepEqual(memory.forget({principal:owner,project}),{removed:1});
 assert.deepEqual(memory.recall({principal,project}),[]);
}));
