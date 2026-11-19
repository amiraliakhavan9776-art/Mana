#!/usr/bin/env node
'use strict';
const {runSpecLearning}=require('./src/native/spec-learning-loop.cjs');
async function main(){
 if(process.argv.length!==4)throw Error('Usage: MANA_CODER_PORT=<port> MANA_CODER_MODEL=<explicit-model> node mana-ai/spec-learning.cjs /absolute/reviewed-spec.md /absolute/private-workspace');
 const raw=process.env.MANA_CODER_PORT;if(!raw||!/^\d{1,5}$/.test(raw))throw Error('Explicit MANA_CODER_PORT required');
 const result=await runSpecLearning({specPath:process.argv[2],workspace:process.argv[3],port:Number(raw),model:process.env.MANA_CODER_MODEL});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(!['SPEC_LEARNING_PASSED','REVIEWED_COURSE_PASSED'].includes(result.status))process.exitCode=2;
}
if(require.main===module)main().catch(error=>{process.stderr.write(JSON.stringify({status:'BLOCKED',error:error.message,productionDeploymentAllowed:false,modelTrainingPerformed:false})+'\n');process.exitCode=1;});
module.exports={main};
