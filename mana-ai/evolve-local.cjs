'use strict';
const path=require('node:path');
const {parseExactJSON}=require('./src/exact-json.cjs');
const {evolveSkill,proposeLocal,readRegular}=require('./src/native/skill-evolution.cjs');
async function main(){const [taskFile,workspace]=process.argv.slice(2);if(process.argv.length!==4||!path.isAbsolute(taskFile)||!path.isAbsolute(workspace))throw Error('Usage: node evolve-local.cjs /absolute/task.json /absolute/private-workspace');const task=parseExactJSON(readRegular(taskFile,32000));const result=await evolveSkill({task,workspace,propose:args=>proposeLocal({...args,port:Number(process.env.MANA_CODER_PORT),model:process.env.MANA_CODER_MODEL??null}),maxAttempts:3});console.log(JSON.stringify(result,null,2));if(result.status!=='BENCHMARK_PASSED_AWAITING_REVIEW')process.exitCode=2;}
main().catch(()=>{console.error('Evolution refused; inspect task, private workspace or existing lock. No live code changed.');process.exitCode=1;});
