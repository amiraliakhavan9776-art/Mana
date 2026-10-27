'use strict';
// Small single-host store for isolated pilots. All callers cooperate on one lock.
const fs=require('node:fs'),path=require('node:path');
const {randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const LIMIT=2*1024*1024;
function createEncryptedState({file,key,kind}){
 if(typeof file!=='string'||!path.isAbsolute(file)||!Buffer.isBuffer(key)||key.length!==32||typeof kind!=='string'||!kind)throw Error('Absolute state path, kind and 32-byte key required');
 const secret=Buffer.from(key);
 file=path.join(fs.realpathSync(path.dirname(file)),path.basename(file));
 function transact(update){
  const lockPath=file+'.lock',lock=fs.openSync(lockPath,'wx',0o600);
  let temp;
  try{
   let state=null;
   if(fs.existsSync(file)){
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>LIMIT+28||stat.size<28)throw Error('Invalid encrypted state file');
    const bytes=fs.readFileSync(file),cipher=createDecipheriv('aes-256-gcm',secret,bytes.subarray(0,12));
    cipher.setAAD(Buffer.from(kind));cipher.setAuthTag(bytes.subarray(12,28));
    state=JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8'));
   }
   const transaction=update(state);
   if(!transaction||typeof transaction!=='object'||typeof transaction.then==='function')throw Error('Synchronous state transaction required');
   if(transaction.write){
    const plaintext=Buffer.from(JSON.stringify(transaction.state));
    if(plaintext.length>LIMIT)throw Error('State capacity reached');
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,nonce);
    cipher.setAAD(Buffer.from(kind));
    const body=Buffer.concat([cipher.update(plaintext),cipher.final()]);
    const bytes=Buffer.concat([nonce,cipher.getAuthTag(),body]);
    temp=file+'.'+randomBytes(12).toString('hex')+'.tmp';
    const fd=fs.openSync(temp,'wx',0o600);
    try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
    fs.renameSync(temp,file);temp=null;
    const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir)}finally{fs.closeSync(dir)}
   }
   return transaction.result;
  }finally{
   if(temp)fs.rmSync(temp,{force:true});
   fs.closeSync(lock);fs.unlinkSync(lockPath);
  }
 }
 return Object.freeze({transact});
}
module.exports={createEncryptedState};
