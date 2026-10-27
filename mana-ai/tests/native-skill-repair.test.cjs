'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {repairNativeSkill,enumerateMutations}=require('../src/native/native-skill-repair.cjs');
const digest='a'.repeat(64);
function spec(){return {schema:'MANA_NATIVE_SKILL_V1',name:'total_cost',fields:['a','b'],expression:{op:'subtract',args:[{field:'a'},{field:'b'}]},tests:[{input:{a:'10',b:'2'},expected:'12'},{input:{a:'7',b:'3'},expected:'10'},{input:{a:'0',b:'0'},expected:'0'}]}}
const fail=x=>({status:'FAILED',executed:true,passed:false,testSha256:digest,sourceSha256:x.sourceSha256});
test('mutation bound is deterministic and does not mutate original',()=>{const s=spec(),a=enumerateMutations(s.expression,4);assert.equal(a.length,4);assert.equal(s.expression.op,'subtract');assert.deepEqual(a,enumerateMutations(s.expression,4))});
test('bounded repair finds alternate operator only after independently verified success',async()=>{const s=spec();let count=0;const r=await repairNativeSkill({spec:s,maxCandidates:6,verifier:async x=>{count++;return x.candidateIndex===1?{status:'PASSED',executed:true,passed:true,testSha256:digest,sourceSha256:x.sourceSha256}:fail(x)}});assert.equal(r.status,'PASSED_AWAITING_HUMAN_REVIEW');assert.equal(count,2);assert.equal(r.proposedExpression.op,'add');assert.equal(r.approved,false);assert.equal(r.productionDeploymentAllowed,false);assert.equal(s.expression.op,'subtract')});
test('rejects unverifiable success',async()=>{await assert.rejects(()=>repairNativeSkill({spec:spec(),verifier:async x=>({status:'PASSED',executed:true,passed:true,sourceSha256:x.sourceSha256})}),/digest/)});
test('rejects receipt bound to different candidate',async()=>{await assert.rejects(()=>repairNativeSkill({spec:spec(),verifier:async()=>({status:'PASSED',executed:true,passed:true,testSha256:digest,sourceSha256:'b'.repeat(64)})}),/mismatch/)});
test('fails closed when sandbox unavailable',async()=>{let count=0;const r=await repairNativeSkill({spec:spec(),verifier:async()=>{count++;return {status:'SANDBOX_UNAVAILABLE',executed:false,passed:false}}});assert.equal(r.status,'SANDBOX_UNAVAILABLE');assert.equal(count,1)});
test('exhaustion never self-approves',async()=>{const r=await repairNativeSkill({spec:spec(),maxCandidates:2,verifier:async x=>fail(x)});assert.equal(r.status,'NO_VERIFIED_REPAIR');assert.equal(r.attempts.length,2);assert.equal(r.approved,false)});
test('missing independent verifier rejected',async()=>{await assert.rejects(()=>repairNativeSkill({spec:spec()}),/verifier/)});
test('cancellation prevents candidate execution',async()=>{let count=0;const c=new AbortController();c.abort();const r=await repairNativeSkill({spec:spec(),signal:c.signal,verifier:async()=>{count++}});assert.equal(r.status,'CANCELLED');assert.equal(count,0)});
