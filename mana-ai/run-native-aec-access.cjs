'use strict';
const fs=require('node:fs'),path=require('node:path');
const {generate}=require('./src/native/aec-access-plan.cjs');
function read(file){const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>40000)throw Error('Invalid input file');return JSON.parse(fs.readFileSync(file,'utf8'));}
function main(){const [input,optionsFile,destination]=process.argv.slice(2);if(process.argv.length!==5||[input,optionsFile,destination].some(p=>!path.isAbsolute(p)))throw Error('Usage: node run-native-aec-access.cjs /absolute/layout.json /absolute/options.json /absolute/new-output-dir');
 const {report,files,sha256}=generate(read(input),read(optionsFile));fs.mkdirSync(destination,{recursive:false,mode:0o700});for(const [name,content]of Object.entries(files))fs.writeFileSync(path.join(destination,name),content,{flag:'wx',mode:0o600});console.log(JSON.stringify({status:report.status,doors:report.doors.length,windows:report.windows.length,inaccessibleRooms:report.inaccessibleRooms,sha256},null,2));if(report.status!=='SCHEMATIC_ACCESS_CONNECTED')process.exitCode=2;
}
try{main()}catch(error){console.error('AEC access: '+error.message);process.exitCode=1;}
