'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const MAX_MESSAGES=80;
function validId(id){return typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id)}
function createConversationStore({directory,key}={}){
 if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Absolute storage directory required');
 if(!(key instanceof Buffer)||key.length!==32)throw Error('32-byte encryption key required');
 const fileFor=({organizationId,userId,conversationId})=>{
  if(![organizationId,userId,conversationId].every(validId))throw Error('Invalid scope');
  const digest=createHash('sha256').update(JSON.stringify([organizationId,userId,conversationId])).digest('hex');
  return path.join(directory,digest+'.enc');
 };
 const encrypt=value=>{
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
  const plaintext=Buffer.from(JSON.stringify(value));
  const body=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return Buffer.concat([Buffer.from('MANA1'),nonce,cipher.getAuthTag(),body]);
 };
 const decrypt=bytes=>{
  if(bytes.length<33||bytes.subarray(0,5).toString()!=='MANA1')throw Error('Invalid encrypted record');
  const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(5,17));
  decipher.setAuthTag(bytes.subarray(17,33));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(33)),decipher.final()]).toString('utf8'));
 };
 const queues=new Map();
 async function read(scope){
  const file=fileFor(scope);
  try{
   const record=decrypt(await fs.readFile(file));
   if(!Array.isArray(record.messages))throw Error('Corrupt conversation');
   return record.messages.map(m=>({...m}));
  }catch(err){if(err.code==='ENOENT')return [];throw err}
 }
 async function append(scope,{role,text}){
  if(!['user','assistant'].includes(role)||typeof text!=='string'||!text.trim()||text.length>4000)throw Error('Invalid message');
  const file=fileFor(scope);
  const previous=queues.get(file)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
   await fs.mkdir(directory,{recursive:true,mode:0o700});
   const messages=await read(scope);
   messages.push({role,text,at:new Date().toISOString()});
   const output=encrypt({version:1,messages:messages.slice(-MAX_MESSAGES)});
   const temp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
   try{
    await fs.writeFile(temp,output,{flag:'wx',mode:0o600});
    await fs.rename(temp,file);
   }finally{await fs.rm(temp,{force:true})}
  });
  queues.set(file,task);
  try{await task}finally{if(queues.get(file)===task)queues.delete(file)}
 }
 return {read,append};
}
module.exports={createConversationStore};
