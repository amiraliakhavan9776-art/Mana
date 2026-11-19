#!/usr/bin/env node
'use strict';
const {runSpecLearning}=require('./src/native/spec-learning-loop.cjs');
async function main(){
 const args=process.argv.slice(2),positional=[];let grammar=false,reviewFeedback=false,feedbackFrom;
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--llama-grammar'){if(grammar)throw Error('Duplicate grammar option');grammar=true;}
  else if(arg==='--review-feedback'){if(reviewFeedback)throw Error('Duplicate feedback option');reviewFeedback=true;}
  else if(arg==='--feedback-from'){if(feedbackFrom!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw Error('One absolute prior workspace required');feedbackFrom=args[++i];}
  else if(arg.startsWith('--'))throw Error('Unknown option');else positional.push(arg);
 }
 if(positional.length!==2||reviewFeedback!==Boolean(feedbackFrom)||reviewFeedback&&!grammar)throw Error('Usage: node mana-ai/spec-learning.cjs [--llama-grammar [--review-feedback --feedback-from /absolute/prior-failed-workspace]] /absolute/reviewed-spec.txt /absolute/new-private-workspace');
 const raw=process.env.MANA_CODER_PORT;if(!raw||!/^\d{1,5}$/.test(raw))throw Error('Explicit MANA_CODER_PORT required');
 const result=await runSpecLearning({specPath:positional[0],workspace:positional[1],port:Number(raw),model:process.env.MANA_CODER_MODEL,...(grammar?{constraint:'llama-gbnf-v1'}:{}),...(reviewFeedback?{reviewFeedback:true,feedbackFrom}:{})});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(!['SPEC_LEARNING_PASSED','REVIEWED_COURSE_PASSED'].includes(result.status))process.exitCode=2;
}
if(require.main===module)main().catch(error=>{process.stderr.write(JSON.stringify({status:'BLOCKED',error:error.message,productionDeploymentAllowed:false,modelTrainingPerformed:false})+'\n');process.exitCode=1;});
module.exports={main};
