'use strict';
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const {createHash,randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const MAX_MESSAGES=80,MAX_BYTES=2*1024*1024;
function validId(id){return typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id)}
function createConversationStore({directory,key}={}){
 if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Absolute storage directory required');
 if(!Buffer.isBuffer(key)||key.length!==32)throw Error('32-byte encryption key required');
 const secret=Buffer.from(key),queues=new Map();
 const bind=scope=>{
  if(!scope||![scope.organizationId,scope.userId,scope.conversationId].every(validId))throw Error('Invalid scope');
  return {organizationId:scope.organizationId,userId:scope.userId,conversationId:scope.conversationId};
 };
 const identity=s=>JSON.stringify([s.organizationId,s.userId,s.conversationId]);
 const aad=s=>Buffer.from('MANA_CONVERSATION_V2:'+identity(s));
 const fileFor=s=>path.join(directory,createHash('sha256').update(identity(s)).digest('hex')+'.enc');
 function messagesFor(record,version){
  if(!record||record.version!==version||!Array.isArray(record.messages)||record.messages.length>MAX_MESSAGES)throw Error('Corrupt conversation');
  return record.messages.map(m=>{
   if(!m||!['user','assistant'].includes(m.role)||typeof m.text!=='string'||!m.text.trim()||m.text.length>4000||typeof m.at!=='string'||!Number.isFinite(Date.parse(m.at)))throw Error('Corrupt message');
   return {role:m.role,text:m.text,at:m.at};
  });
 }
 function encrypt(messages,scope){
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,nonce);
  cipher.setAAD(aad(scope));
  const plaintext=Buffer.from(JSON.stringify({version:2,messages}));
  const body=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return Buffer.concat([Buffer.from('MANA2'),nonce,cipher.getAuthTag(),body]);
 }
 function decrypt(bytes,scope,{legacy=false}={}){
  const header=bytes.subarray(0,5).toString();
  if(bytes.length<33||bytes.length>MAX_BYTES)throw Error('Invalid encrypted record');
  if(header==='MANA1'&&!legacy)throw Error('Legacy conversation requires verified migration');
  if(header!==(legacy?'MANA1':'MANA2'))throw Error('Invalid encrypted record');
  const cipher=createDecipheriv('aes-256-gcm',secret,bytes.subarray(5,17));
  if(!legacy)cipher.setAAD(aad(scope));
  cipher.setAuthTag(bytes.subarray(17,33));
  const record=JSON.parse(Buffer.concat([cipher.update(bytes.subarray(33)),cipher.final()]).toString('utf8'));
  return messagesFor(record,legacy?1:2);
 }
 async function bytesFor(file){
  const fd=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try{
   const stat=await fd.stat();if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('Invalid conversation file');
   const bytes=await fd.readFile();if(bytes.length>MAX_BYTES)throw Error('Conversation too large');return bytes;
  }finally{await fd.close()}
 }
 async function readBound(scope){
  try{return decrypt(await bytesFor(fileFor(scope)),scope)}catch(err){if(err.code==='ENOENT')return [];throw err}
 }
 async function read(scope){return readBound(bind(scope))}
 async function write(file,bytes){
  const temp=file+'.'+randomBytes(12).toString('hex')+'.tmp';
  try{
   const fd=await fs.open(temp,'wx',0o600);
   try{await fd.writeFile(bytes);await fd.sync()}finally{await fd.close()}
   await fs.rename(temp,file);
   const dir=await fs.open(directory,'r');try{await dir.sync()}finally{await dir.close()}
  }finally{await fs.rm(temp,{force:true})}
 }
 async function exclusive(scope,operation){
  const file=fileFor(scope),previous=queues.get(file)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
   await fs.mkdir(directory,{recursive:true,mode:0o700});
   const lock=await fs.open(file+'.lock','wx',0o600);
   try{return await operation(file)}finally{await lock.close();await fs.unlink(file+'.lock')}
  });
  queues.set(file,task);
  try{return await task}finally{if(queues.get(file)===task)queues.delete(file)}
 }
 async function append(scope,{role,text}){
  const bound=bind(scope);
  if(!['user','assistant'].includes(role)||typeof text!=='string'||!text.trim()||text.length>4000)throw Error('Invalid message');
  return exclusive(bound,async file=>{
   const messages=await readBound(bound);
   messages.push({role,text,at:new Date().toISOString()});
   await write(file,encrypt(messages.slice(-MAX_MESSAGES),bound));
  });
 }
 // The expected digest must come from a separately trusted scope-to-file backup manifest.
 // Never generate it from the untrusted live file as an automatic migration step.
 async function migrateLegacy(scope,{expectedSha256}={}){
  const bound=bind(scope);
  if(typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256))throw Error('Trusted legacy file digest required');
  return exclusive(bound,async file=>{
   const bytes=await bytesFor(file);
   if(bytes.subarray(0,5).toString()==='MANA2'){decrypt(bytes,bound);return {migrated:false}}
   if(createHash('sha256').update(bytes).digest('hex')!==expectedSha256)throw Error('Legacy manifest digest mismatch');
   const messages=decrypt(bytes,bound,{legacy:true});
   await write(file,encrypt(messages,bound));return {migrated:true,messages:messages.length};
  });
 }
 return Object.freeze({read,append,migrateLegacy});
}
module.exports={createConversationStore};
