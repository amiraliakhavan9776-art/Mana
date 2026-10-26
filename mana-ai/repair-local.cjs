'use strict';
const path=require('node:path');
const {repairCode}=require('./src/native/code-repair.cjs');
const {createLocalCodeProposer}=require('./src/native/code-workbench.cjs');
const {createPythonCodeSandbox}=require('./src/native/python-code-sandbox.cjs');
const {parseExactJSON}=require('./src/exact-json.cjs');
const {readRegular}=require('./src/native/skill-evolution.cjs');
async function main(){const [taskFile,projectRoot,workspace]=process.argv.slice(2);if(process.argv.length!==5||!path.isAbsolute(taskFile))throw Error('Explicit task/project/workspace paths required');const task=parseExactJSON(readRegular(taskFile,100000));if(!task||Object.keys(task).sort().join(',')!=='benchmark,file,request')throw Error('Invalid repair task');const propose=process.env.MANA_CODER_PORT&&process.env.MANA_CODER_MODEL?createLocalCodeProposer({port:Number(process.env.MANA_CODER_PORT),model:process.env.MANA_CODER_MODEL}):undefined;const result=await repairCode({...task,projectRoot,workspace,propose,sandbox:createPythonCodeSandbox()});console.log(JSON.stringify(result,null,2));if(result.status!=='CODE_CANDIDATE_AWAITING_REVIEW')process.exitCode=2;}
main().catch(()=>{console.error('Code repair stopped. No original code or live service changed.');process.exitCode=1;});
