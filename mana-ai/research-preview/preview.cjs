'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {startQueueResearchPreview,HOLDOUT_SHA256}=require('./runner.cjs');
const {PINS}=require('./cpython-source.cjs');
function boundedFile(file,cap){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.size<1||st.size>cap)throw Error('ARTIFACT_SIZE_EXCEEDED');
  const bytes=Buffer.alloc(st.size+1);
  let offset=0;
  while(offset<bytes.length){
   const n=fs.readSync(fd,bytes,offset,bytes.length-offset,null);
   if(!n)break;offset+=n;
  }
  if(offset!==st.size)throw Error('ARTIFACT_SIZE_CHANGED');
  return bytes.subarray(0,offset);
 }finally{fs.closeSync(fd);}
}
function readerFromDirectory(dir){
 if(!path.isAbsolute(dir)||fs.realpathSync(dir)!==dir||!fs.lstatSync(dir).isDirectory())throw Error('CANONICAL_CAPTURE_DIRECTORY_REQUIRED');
 return async selected=>{
  if(!Object.hasOwn(PINS,selected))throw Error('SOURCE_PATH_REJECTED');
  const file=path.join(dir,path.basename(selected)+'.json');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(boundedFile(file,128*1024)));
 };
}
if(require.main===module){
 const [workspace,captures,...extra]=process.argv.slice(2);
 const holdoutPath=path.join(__dirname,'holdout.json');
 const queue=path.resolve(__dirname,'../capability-registry/development-queue-v01.json');
 const live=captures==='--official-https';
 if(extra.length||![workspace,queue,holdoutPath].every(x=>x&&path.isAbsolute(x))||!(live||captures&&path.isAbsolute(captures)))throw Error('Usage: preview.cjs /private/state --official-https|/pinned/captures');
 const port=process.env.MANA_QUEUE_RESEARCH_PORT===undefined?0:Number(process.env.MANA_QUEUE_RESEARCH_PORT);
 const server=startQueueResearchPreview({workspace,queueBytes:boundedFile(queue,128*1024),holdoutPath,holdoutSha256:HOLDOUT_SHA256,sourceMode:live?'official-https':'pinned-replay',readOfficial:live?require('./official-https.cjs').readOfficial:readerFromDirectory(captures),port});
 server.once('listening',()=>console.log('MANA CPU staging: http://127.0.0.1:'+server.address().port));
 for(const s of ['SIGINT','SIGTERM'])process.once(s,()=>server.close());
}
module.exports={readerFromDirectory};
