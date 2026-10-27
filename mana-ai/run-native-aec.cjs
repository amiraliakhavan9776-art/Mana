'use strict';
const fs=require('node:fs'),path=require('node:path');
const {runBrief}=require('./src/native/aec-schematic.cjs');
function main(){const [input,output]=process.argv.slice(2);if(process.argv.length!==4||!path.isAbsolute(input)||!path.isAbsolute(output))throw Error('Usage: node run-native-aec.cjs /absolute/brief.json /absolute/new-output-dir');const stat=fs.lstatSync(input);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>20000)throw Error('Invalid brief file');const brief=JSON.parse(fs.readFileSync(input,'utf8'));const r=runBrief(brief);fs.mkdirSync(output,{recursive:false,mode:0o700});for(const [name,content] of Object.entries(r.files))fs.writeFileSync(path.join(output,name),content,{flag:'wx',mode:0o600});console.log(JSON.stringify({schema:r.report.schema,files:Object.keys(r.files),receipts:r.receipts,productionDeploymentAllowed:false},null,2))}
try{main()}catch(e){console.error('MANA AEC: '+e.message);process.exitCode=1}
