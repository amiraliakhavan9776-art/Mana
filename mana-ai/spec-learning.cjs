#!/usr/bin/env node
'use strict';
const {runSpecLearning}=require('./src/native/spec-learning-loop.cjs');
async function main(){
 const args=process.argv.slice(2),grammar=args.filter(x=>x==='--llama-grammar').length;
 if(grammar>1||args.length!==2+grammar||args.some(x=>x.startsWith('--')&&x!=='--llama-grammar'))throw Error('Usage: MANA_CODER_PORT=<port> MANA_CODER_MODEL=<explicit-model> node mana-ai/spec-learning.cjs [--llama-grammar] /absolute/reviewed-spec.txt /absolute/private-workspace');
 const positional=args.filter(x=>x!=='--llama-grammar');
 const raw=process.env.MANA_CODER_PORT;if(!raw||!/^\d{1,5}$/.test(raw))throw Error('Explicit MANA_CODER_PORT required');
 const result=await runSpecLearning({specPath:positional[0],workspace:positional[1],port:Number(raw),model:process.env.MANA_CODER_MODEL,...(grammar?{constraint:'llama-gbnf-v1'}:{})});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(!['SPEC_LEARNING_PASSED','REVIEWED_COURSE_PASSED'].includes(result.status))process.exitCode=2;
}
if(require.main===module)main().catch(error=>{process.stderr.write(JSON.stringify({status:'BLOCKED',error:error.message,productionDeploymentAllowed:false,modelTrainingPerformed:false})+'\n');process.exitCode=1;});
module.exports={main};
