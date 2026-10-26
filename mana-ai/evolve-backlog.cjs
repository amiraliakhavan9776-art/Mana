'use strict';
// Host-authored task directory only. Never discovers business files or modifies live code.
const fs=require('node:fs'),path=require('node:path');
const {parseExactJSON}=require('./src/exact-json.cjs');
const {evolveSkill,readRegular,validateTask}=require('./src/native/skill-evolution.cjs');
async function main(){
 const [taskDirectory,workspace]=process.argv.slice(2);
 if(process.argv.length!==4||!path.isAbsolute(taskDirectory)||!path.isAbsolute(workspace))throw Error('Absolute paths required');
 const stat=fs.lstatSync(taskDirectory);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Task directory required');
 const names=fs.readdirSync(taskDirectory).filter(x=>/^[a-z0-9_-]+\.json$/.test(x)).sort();if(!names.length||names.length>10)throw Error('One to ten tasks required');
 const tasks=names.map(name=>validateTask(parseExactJSON(readRegular(path.join(taskDirectory,name),32000))));if(new Set(tasks.map(t=>t.id)).size!==tasks.length)throw Error('Duplicate task ID');
 const results=[];
 for(const task of tasks){const result=await evolveSkill({task,workspace,maxAttempts:3});results.push({taskId:task.id,status:result.status,directory:result.directory,candidateHash:result.candidateHash??null});if(result.status==='DEPENDENCY_UNAVAILABLE')break;}
 const allPassed=results.length===tasks.length&&results.every(x=>x.status==='BENCHMARK_PASSED_AWAITING_REVIEW');
 console.log(JSON.stringify({status:allPassed?'BACKLOG_AWAITING_REVIEW':'BACKLOG_INCOMPLETE',results,approved:false,productionDeploymentAllowed:false},null,2));if(!allPassed)process.exitCode=2;
}
main().catch(()=>{console.error('Backlog stopped. No live code changed; inspect trusted tasks, private checkpoints or lock.');process.exitCode=1;});
