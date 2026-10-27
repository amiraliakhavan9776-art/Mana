'use strict';
/** Offline review CLI; never applies changes to any original input or project. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {state,proposeRevision}=require('./src/native/aec-revision.cjs');
function readJson(file){
 if(!path.isAbsolute(file))throw Error('Absolute JSON path required');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const st=fs.fstatSync(fd);if(!st.isFile()||st.size>100000)throw Error('Regular JSON file under 100KB required');return JSON.parse(fs.readFileSync(fd,'utf8'));}
 finally{fs.closeSync(fd)}
}
function main(){
 const [briefPath,requestPath,outDir]=process.argv.slice(2);
 if(process.argv.length!==5||!path.isAbsolute(outDir))throw Error('Usage: node run-native-aec-revision.cjs /absolute/brief.json /absolute/revision.json /absolute/new-output-dir');
 if(fs.existsSync(outDir))throw Error('Output directory already exists; existing data is never overwritten');
 const brief=readJson(briefPath),request=readJson(requestPath);
 if(!request||Object.keys(request).sort().join('|')!=='actor|changes|expectedSha256|expectedVersion|reason')throw Error('Invalid request contract');
 const current=state(brief);
 const r=proposeRevision({current,...request});
 const files={
  'revision-impact.json':JSON.stringify(r.impact,null,2)+'\n',
  'next-brief.json':JSON.stringify(r.nextState.brief,null,2)+'\n',
  'next-state.json':JSON.stringify(r.nextState,null,2)+'\n',
  ...Object.fromEntries(Object.entries(r.preview.files).map(([name,value])=>['preview-'+name,value]))
 };
 const manifest={schema:'MANA_AEC_REVISION_ARTIFACT_MANIFEST_V1',inputVersion:current.version,inputSha256:current.sourceSha256,outputVersion:r.nextState.version,files:Object.fromEntries(Object.entries(files).map(([name,content])=>[name,{sha256:crypto.createHash('sha256').update(content).digest('hex'),bytes:Buffer.byteLength(content)}])),approved:false,productionDeploymentAllowed:false};
 fs.mkdirSync(outDir,{mode:0o700});
 for(const [name,content] of Object.entries(files))fs.writeFileSync(path.join(outDir,name),content,{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(outDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:'SCHEMATIC_REVISION_READY_FOR_REVIEW',directory:outDir,files:Object.keys(manifest.files).length,approved:false}));
}
try{main()}catch(e){console.error('MANA AEC Revision: '+e.message);process.exitCode=1}
