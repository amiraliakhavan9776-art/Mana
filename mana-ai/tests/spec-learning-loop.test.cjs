'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const test=require('node:test');
const {createSpecLearning,runSpecLearning}=require('../src/native/spec-learning-loop.cjs');
const task=id=>({schema:'MANA_SKILL_TASK_V1',id,instruction:'Return the number x unchanged.',fields:['x'],
 tests:[11,23,91].map(x=>({input:{x},expected:x}))});
const missions=['first','second'].map((id,i)=>({
 id,section:i?'6.6':'6.4',sectionSha256:String(i+1).repeat(64),task:task(id),dependsOn:i?['first']:[]
}));
const valid='{"field":"x"}';
function scenario(t){
 const workspace=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mana-spec-test.'));
 t.after(()=>fs.rmSync(workspace,{recursive:true,force:true}));
 const specPath=path.join(path.dirname(workspace),'synthetic-test-master.txt');
 let spec='a'.repeat(64);
 const run=createSpecLearning({readSpec:()=>({sha256:spec,missions:structuredClone(missions)})});
 return {workspace,run:args=>run({workspace,specPath,port:4444,model:'test-fixture-model',...args}),mutate:()=>{spec='b'.repeat(64);}};
}
test('selects one reviewed mission per invocation; no tests sent, resume unlocks second, completion makes no model call',async t=>{
 const s=scenario(t);let calls=0;
 const propose=async args=>{
  assert.deepEqual(Object.keys(args).sort(),['feedback','fields','instruction','model','port']);
  assert.deepEqual(args.fields,['x']);
  assert.ok(!JSON.stringify(args).includes('91'));
  assert.equal(fs.existsSync(path.join(s.workspace,calls===0?'first.claim.json':'second.claim.json')),true);
  calls++;return valid;
 };
 const first=await s.run({propose}); assert.equal(first.missionId,'first');assert.equal(first.status,'SPEC_LEARNING_PASSED');assert.equal(first.modelTrainingPerformed,false);
 const second=await s.run({propose});assert.equal(second.missionId,'second');assert.equal(second.productionDeploymentAllowed,false);
 const complete=await s.run({propose});assert.equal(complete.status,'REVIEWED_COURSE_PASSED');assert.equal(calls,2);
});
test('a failed expression is retained, consumes its attempt and never unlocks its dependant',async t=>{
 const s=scenario(t);let calls=0;
 const propose=async()=>{calls++;return '{"value":0}';};
 const failed=await s.run({propose});assert.equal(failed.status,'SPEC_LEARNING_REVIEW_REQUIRED');
 assert.equal(failed.result.status,'BUDGET_EXHAUSTED');
 assert.equal((await s.run({propose})).status,'NO_READY_MISSION');assert.equal(calls,1);
});
test('interrupted or stale attempt never repeats and corrupt state stops',async t=>{
 const s=scenario(t);const propose=async()=>{s.mutate();return valid;};
 await assert.rejects(s.run({propose}),/changed during execution/);s.mutate=()=>{};
 const run=createSpecLearning({readSpec:()=>({sha256:'a'.repeat(64),missions:structuredClone(missions)})});
 const args={workspace:s.workspace,specPath:'/tmp/synthetic-test-master.txt',port:4444,model:'test-fixture-model',propose:()=>assert.fail('unexpected model call')};
 assert.equal((await run(args)).status,'INTERRUPTED_UNKNOWN');
 fs.writeFileSync(path.join(s.workspace,'first.claim.json'),'broken');
 await assert.rejects(run(args));
});
test('job state is bound to provider and source; a concurrent call cannot dispatch twice',async t=>{
 const s=scenario(t);let resolve,claimed;
 const started=new Promise(r=>{claimed=r;});const pending=new Promise(r=>{resolve=r;});
 const first=s.run({propose:async()=>{claimed();return pending;}});await started;
 await assert.rejects(s.run({propose:()=>assert.fail('duplicate call')}));resolve(valid);await first;
 await assert.rejects(s.run({model:'changed',propose:()=>assert.fail('wrong provider')}),/manifest/i);
});
test('default catalog refuses an unrecognized source before any model request',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-unreviewed-spec.'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const specPath=path.join(dir,'fake.txt'),workspace=path.join(dir,'state');
 fs.writeFileSync(specPath,'Version 1.1; unreviewed input');
 await assert.rejects(runSpecLearning({specPath,workspace,port:4444,model:'test-fixture-model',propose:()=>assert.fail('unreviewed dispatch')}));
 assert.equal(fs.existsSync(workspace),false);
});
test('constrained trial is explicit and cannot reuse or rewrite a prior workspace',async t=>{
 const legacy=scenario(t), grammar=scenario(t);
 const passed=await legacy.run({propose:()=>valid});
 assert.equal(passed.providerConstraint,'none');
 const manifestPath=path.join(legacy.workspace,'manifest.json');
 const before=fs.readFileSync(manifestPath);
 await assert.rejects(legacy.run({constraint:'llama-gbnf-v1',propose:()=>assert.fail('called with previous state')}),/manifest/i);
 assert.deepEqual(fs.readFileSync(manifestPath),before);
 let calls=0;
 const failure=await grammar.run({constraint:'llama-gbnf-v1',propose:args=>{
  assert.equal(args.constraint,'llama-gbnf-v1');calls++;throw Object.assign(Error('unsupported'),{stage:'transport',code:'TRANSPORT_HTTP_STATUS'});
 }});
 assert.equal(failure.providerConstraint,'llama-gbnf-v1');
 assert.equal(failure.result.status,'DEPENDENCY_UNAVAILABLE');
 assert.equal((await grammar.run({constraint:'llama-gbnf-v1',propose:()=>assert.fail('fallback or retry')})).status,'NO_READY_MISSION');
 assert.equal(calls,1);
});
