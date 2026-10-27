'use strict';
// Explicit synthetic generator verifies the mechanism without claiming model intelligence.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {evolveSkill}=require('./src/native/skill-evolution.cjs');
const task=require('./examples/skill.clamp-percent.json');
async function main(){const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'mana-evolution-check-'));fs.chmodSync(workspace,0o700);let attempts=0;const expression={op:'min',args:[{value:100},{op:'max',args:[{value:0},{field:'percent'}]}]};
 const result=await evolveSkill({task,workspace,propose:async()=>JSON.stringify(++attempts===1?{value:0}:expression)});
 assert.equal(result.status,'BENCHMARK_PASSED_AWAITING_REVIEW');assert.equal(result.attempt,2);
 const restart=await evolveSkill({task,workspace,propose:async()=>{throw Error('Generator must not run after success');}});assert.equal(restart.resumed,true);assert.equal(restart.candidateHash,result.candidateHash);
 console.log(JSON.stringify({syntheticGenerator:true,realModelTested:false,status:'MECHANISM_CHECK_PASSED',failedCandidateRejected:true,passingCandidateSaved:true,restartVerified:true,workspace,approved:false,productionDeploymentAllowed:false},null,2));}
main().catch(()=>{console.error('Evolution mechanism check failed');process.exitCode=1;});
