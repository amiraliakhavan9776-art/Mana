'use strict';
const fs=require('node:fs'),path=require('node:path');
const {generate}=require('./src/native/aec-layout-solver.cjs');
function main(){
 const [src,dst]=process.argv.slice(2);if(process.argv.length!==4||!path.isAbsolute(src)||!path.isAbsolute(dst))throw Error('Usage: node run-native-aec-layout.cjs /absolute/input.json /absolute/new-output-dir');
 const st=fs.lstatSync(src);if(!st.isFile()||st.isSymbolicLink()||st.size>30000)throw Error('Invalid input');
 const result=generate(JSON.parse(fs.readFileSync(src,'utf8')));
 fs.mkdirSync(dst,{recursive:false,mode:0o700});for(const [name,value] of Object.entries(result.files))fs.writeFileSync(path.join(dst,name),value,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:result.report.status,searchNodes:result.report.searchNodes,sha256:result.sha256},null,2));
 if(result.report.status!=='FEASIBLE_SCHEMATIC_LAYOUT')process.exitCode=2;
}
try{main()}catch(e){console.error('AEC layout: '+e.message);process.exitCode=1;}
