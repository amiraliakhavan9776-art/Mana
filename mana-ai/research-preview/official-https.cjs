'use strict';
const https=require('node:https');
const {REPOSITORY,COMMIT,PINS}=require('./cpython-source.cjs');
const CAP=65536;
const hostname='raw.githubusercontent.com';
function readOfficial(path){
 if(typeof path!=='string'||!Object.hasOwn(PINS,path))return Promise.reject(Error('SOURCE_PATH_REJECTED'));
 return new Promise((resolve,reject)=>{
  const signal=AbortSignal.timeout(6000);
  const request=https.get({
   protocol:'https:',hostname,port:443,
   path:'/'+REPOSITORY+'/'+COMMIT+'/'+path,
   agent:false,signal,headers:{'Accept':'text/plain','Accept-Encoding':'identity','User-Agent':'MANA-Research-Preview/1'},
  },response=>{
   response.once('error',reject);
   if(response.statusCode!==200||!/^text\/plain\b/i.test(response.headers['content-type']??'')||(response.headers['content-encoding']??'identity')!=='identity'){
    response.destroy();reject(Error('OFFICIAL_DOCUMENT_NOT_AVAILABLE'));return;
   }
   const chunks=[];let size=0;
   response.on('data',chunk=>{
    size+=chunk.length;
    if(size>CAP){response.destroy();reject(Error('OFFICIAL_DOCUMENT_LIMIT'));return;}
    chunks.push(chunk);
   });
   response.once('end',()=>resolve({
    repository:REPOSITORY,commit:COMMIT,path,gitBlobSha:PINS[path],
    url:'https://github.com/'+REPOSITORY+'/blob/'+COMMIT+'/'+path,
    retrievedAt:new Date().toISOString(),contentBase64:Buffer.concat(chunks,size).toString('base64'),
   }));
  });
  request.once('error',reject);
 });
}
module.exports={readOfficial};
