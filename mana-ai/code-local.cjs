'use strict';
const path=require('node:path');
const {parseExactJSON}=require('./src/exact-json.cjs');
const {readRegular}=require('./src/native/skill-evolution.cjs');
const {draftCode}=require('./src/native/code-workbench.cjs');
async function main(){const [taskFile,projectRoot,workspace]=process.argv.slice(2);if(process.argv.length!==5||!path.isAbsolute(taskFile))throw Error('Usage: node code-local.cjs /absolute/request.json /absolute/project /absolute/private-review-workspace');const task=parseExactJSON(readRegular(taskFile,12000));if(!task||Object.keys(task).sort().join(',')!=='allowedFiles,request')throw Error('Invalid task');const result=await draftCode({...task,projectRoot,workspace});console.log(JSON.stringify(result,null,2));if(result.status==='DEPENDENCY_UNAVAILABLE')process.exitCode=2;}
main().catch(()=>{console.error('Coding draft refused. Check explicit paths/context/private workspace. No source or live service was changed.');process.exitCode=1;});
