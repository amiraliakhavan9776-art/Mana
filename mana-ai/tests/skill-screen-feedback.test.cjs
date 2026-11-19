'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {evolveSkill}=require('../src/native/skill-evolution.cjs');
const task={schema:'MANA_SKILL_TASK_V1',id:'candidate-screen-fixture',instruction:'Return the same numeric value as input x.',fields:['x'],
 tests:[13,7,10].map(x=>({input:{x},expected:x}))};
function workspace(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-skill-screen.'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('screen failure is recorded before any arithmetic benchmark and does not disclose tests',async t=>{
 const initialFeedback='Output has the wrong physical dimension.';
 let calls=0;
 const r=await evolveSkill({task,workspace:workspace(t),candidatePolicyId:'dimension-fixture-v1',maxAttempts:1,initialFeedback,
  candidateCheck:()=>({ok:false,code:'DIMENSION_MISMATCH',actualPower:1,expectedPower:3,privateProbe:23}),
  propose:async o=>{calls++;assert.deepEqual(o,{instruction:task.instruction,fields:['x'],feedback:initialFeedback});return '{"field":"x"}';}});
 assert.equal(calls,1);assert.equal(r.testsRun,0);assert.equal(r.total,3);assert.equal(r.passed,0);
 assert.deepEqual(r.lastOutcome,{stage:'dimension',code:'DIMENSION_MISMATCH'});
 assert.deepEqual(r.lastScreen,{ok:false,code:'DIMENSION_MISMATCH',actualPower:1,expectedPower:3});
 const prior=JSON.parse(fs.readFileSync(path.join(r.directory,'attempt-1.json')));
 assert.equal(prior.results.length,0);assert.deepEqual(prior.expression,{field:'x'});
});
test('passing screen does not replace independent benchmark, and screen policy binds checkpoint',async t=>{
 const dir=workspace(t),candidateCheck=()=>({ok:true,code:'SCREEN_PASSED'});
 const base={task,workspace:dir,maxAttempts:1,candidateCheck,candidatePolicyId:'one'};
 const r=await evolveSkill({...base,propose:async()=>'{"value":0}'});
 assert.equal(r.lastOutcome.code,'BENCHMARK_FAILED');assert.equal(r.testsRun,3);
 const s=await evolveSkill({...base,candidatePolicyId:'two',propose:async()=>'{"field":"x"}'});
 assert.equal(s.status,'BENCHMARK_PASSED_AWAITING_REVIEW');assert.notEqual(s.taskHash,r.taskHash);
 await assert.rejects(evolveSkill({...base,candidatePolicyId:undefined}),/policy/);
});
