'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {solve,toDXF}=require('./src/native/aec-layout-solver.cjs');
const {review,proposeRepair}=require('./src/native/aec-quality-gate.cjs');
const {compilePersonalMission}=require('./src/native/jarvis-shared-mission.cjs');
function main(){
 const [inputFile,outputDir]=process.argv.slice(2);
 if(!inputFile||!outputDir||!path.isAbsolute(inputFile)||!path.isAbsolute(outputDir)||outputDir==='/'||outputDir.startsWith('/opt/mana-ai'))throw Error('Require absolute input/output outside active server');
 const st=fs.lstatSync(inputFile);if(!st.isFile()||st.isSymbolicLink()||st.size>50000)throw Error('Unsafe input file');
 const source=JSON.parse(fs.readFileSync(inputFile,'utf8'));
 if(!source||typeof source!=='object'||Object.keys(source).sort().join('|')!=='accessOptions|brief|ownerId')throw Error('Expected brief, ownerId, accessOptions');
 const layout=solve(source.brief),quality=review({brief:source.brief,layout,accessOptions:source.accessOptions});
 const jarvis=compilePersonalMission({missionId:'aec_review',ownerId:source.ownerId,approvedScope:'personal_project',objective:'Review schematic layout, validate circulation and prepare artifacts for human review',tools:['aec.dxf','aec.takeoff']});
 const files={'layout.json':JSON.stringify(layout,null,2)+'\n','quality.json':JSON.stringify(quality,null,2)+'\n','jarvis-plan.json':JSON.stringify(jarvis,null,2)+'\n'};
 if(quality.status==='SCHEMATIC_CHECKS_PASSED')files['schematic.dxf']=toDXF(source.brief,layout);
 if(fs.existsSync(outputDir))throw Error('Output folder must not exist; avoid overwriting outputs');
 fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
 for(const [name,content] of Object.entries(files))fs.writeFileSync(path.join(outputDir,name),content,{flag:'wx',mode:0o600});
 const manifest={schema:'MANA_NATIVE_V8_OUTPUT_RECEIPT',status:quality.status,files:Object.entries(files).map(([name,v])=>({name,bytes:Buffer.byteLength(v),sha256:crypto.createHash('sha256').update(v).digest('hex')})),requiresHumanApproval:true,constructionReady:false};
 fs.writeFileSync(path.join(outputDir,'receipt.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({outputDir,status:quality.status,files:manifest.files.map(x=>x.name)}));
}
try{main()}catch(e){console.error(e.message);process.exitCode=1;}
