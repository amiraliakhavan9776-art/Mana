'use strict';
// One-off public evidence capture. Never emits markup or reads pilot state.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {INDEX_URL,AREA_URL,fetchNasa,discoverNasaArea}=require('./nasa-area-source.cjs');

const LESSON_SHA256='ee6cfe639a6dee602af883fb1411fcb5a8a6e46f35be92421fa937ad69180cef';
const FILE='nasa-area.html';
const SCHEMA='MANA_NASA_PUBLIC_CAPTURE_V1';
const abs=p=>typeof p==='string'&&p.length<4096&&!p.includes('\0')&&path.isAbsolute(p)&&path.resolve(p)===p;
const sha=b=>createHash('sha256').update(b).digest('hex');
function identity(directory){
 const s=fs.lstatSync(directory,{bigint:true});
 if(fs.realpathSync(directory)!==directory||!s.isDirectory()||s.uid!==BigInt(process.getuid())||
    (s.mode&0o7777n)!==0o700n||fs.readdirSync(directory).length!==0)
  throw Error('NASA_CAPTURE_PRIVATE_EMPTY_DIRECTORY_REQUIRED');
 return [s.dev,s.ino];
}
async function capturePinnedArea({pythonPath,outputDir,request}={}){
 const blocked=fault=>({schema:SCHEMA,status:'CAPTURE_BLOCKED',fault});
 if(!abs(pythonPath)||!abs(outputDir))return blocked('NASA_CAPTURE_INPUT_INVALID');
 let initial;
 try{initial=identity(outputDir);}catch{return blocked('NASA_CAPTURE_PRIVATE_EMPTY_DIRECTORY_REQUIRED');}
 let fileBytes=null,requests=0,captureFault=null;
 try{
  // Reuse approved discovery. Only its selected-link branch can fetch Area.
  await discoverNasaArea({mode:'direct',pythonPath,reader:async choice=>{
   const expected=requests===0?INDEX_URL:requests===1?AREA_URL:null;
   if(choice.url!==expected||(requests===1&&choice.kind!=='selected-link'))throw Error('NASA_CAPTURE_LINK_REJECTED');
   requests++;
   const row=await fetchNasa(choice.url,request);
   if(choice.kind==='selected-link'){
    if(sha(row.bytes)!==LESSON_SHA256){
     captureFault='NASA_CAPTURE_LESSON_REVISION_MISMATCH';
     throw Error(captureFault);
    }
    fileBytes=row.bytes;
   }
   return row;
  }});
 }catch{
  // The point of this artifact is to inspect the exact public lesson after
  // the linked transport succeeded even if semantic validation still blocks.
  // No raw parser/transport error is emitted.
 }
 if(!fileBytes||requests!==2)return blocked(captureFault??'NASA_CAPTURE_LINK_OR_TRANSPORT_UNVERIFIED');
 try{
  const latest=identity(outputDir);
  if(latest[0]!==initial[0]||latest[1]!==initial[1])return blocked('NASA_CAPTURE_DIRECTORY_CHANGED');
  const c=fs.constants,fd=fs.openSync(path.join(outputDir,FILE),c.O_WRONLY|c.O_CREAT|c.O_EXCL|c.O_NOFOLLOW,0o600);
  try{fs.writeFileSync(fd,fileBytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  return {schema:SCHEMA,status:'PUBLIC_LESSON_CAPTURED',sha256:LESSON_SHA256,byteCount:fileBytes.length};
 }catch{return blocked('NASA_CAPTURE_WRITE_REJECTED');}
}
if(require.main===module){
 const [pythonPath,outputDir,...rest]=process.argv.slice(2);
 capturePinnedArea(rest.length?{}:{pythonPath,outputDir}).then(result=>{
  console.log(JSON.stringify(result));
  if(result.status!=='PUBLIC_LESSON_CAPTURED')process.exitCode=1;
 },()=>{
  console.log(JSON.stringify({schema:SCHEMA,status:'CAPTURE_BLOCKED',fault:'NASA_CAPTURE_UNVERIFIED'}));
  process.exitCode=1;
 });
}
module.exports={capturePinnedArea};
