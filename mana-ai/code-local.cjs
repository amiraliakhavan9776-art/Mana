'use strict';
const path=require('node:path');
const {parseExactJSON}=require('./src/exact-json.cjs');
const {readRegular}=require('./src/native/skill-evolution.cjs');
const {draftCode,createLocalCodeProposer}=require('./src/native/code-workbench.cjs');
async function main(){const [taskFile,projectRoot,workspace]=process.argv.slice(2);if(process.argv.length!==5||!path.isAbsolute(taskFile))throw Error('Usage: node code-local.cjs /absolute/request.json /absolute/project /absolute/private-review-workspace');const task=parseExactJSON(readRegular(taskFile,12000));if(!task||Object.keys(task).sort().join(',')!=='allowedFiles,request')throw Error('Invalid task');const propose=process.env.MANA_CODER_PORT&&process.env.MANA_CODER_MODEL?createLocalCodeProposer({port:Number(process.env.MANA_CODER_PORT),model:process.env.MANA_CODER_MODEL}):undefined;const result=await draftCode({...task,projectRoot,workspace,propose});console.log(JSON.stringify(result,null,2));if(['DEPENDENCY_UNAVAILABLE','CODING_PROVIDER_UNCONFIGURED'].includes(result.status))process.exitCode=2;}
main().catch(()=>{console.error('Coding draft refused. Check explicit paths/context/private workspace. No source or live service was changed.');process.exitCode=1;});
