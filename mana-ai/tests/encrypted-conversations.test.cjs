'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {randomBytes,createHash,createCipheriv}=require('node:crypto');
const {createConversationStore}=require('../src/encrypted-conversations.cjs');
test('encrypted records persist and isolate organization and user scopes',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mana-conversations-'));
 try{
  const key=randomBytes(32),store=createConversationStore({directory,key});
  const a={organizationId:'orgA',userId:'alice',conversationId:'chat1'};
  const b={organizationId:'orgB',userId:'alice',conversationId:'chat1'};
  await Promise.all([store.append(a,{role:'user',text:'محرمانه'}),store.append(a,{role:'assistant',text:'سلام'})]);
  assert.equal((await store.read(a)).length,2);
  assert.deepEqual(await store.read(b),[]);
  const files=await fs.readdir(directory);
  assert.equal(files.length,1);
  const bytes=await fs.readFile(path.join(directory,files[0]));
  assert.equal(bytes.includes(Buffer.from('محرمانه')),false);
  const second=createConversationStore({directory,key});
  assert.equal((await second.read(a))[0].text,'محرمانه');
  const wrong=createConversationStore({directory,key:randomBytes(32)});
  await assert.rejects(wrong.read(a));
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});
test('rejects invalid scope and keys',async()=>{
 assert.throws(()=>createConversationStore({directory:'/tmp',key:Buffer.alloc(4)}));
 const store=createConversationStore({directory:'/tmp',key:randomBytes(32)});
 await assert.rejects(store.read({organizationId:'../bad',userId:'a',conversationId:'b'}));
});
test('ciphertext cannot be transplanted across organization, user or conversation scopes',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mana-scope-auth-'));
 try{
  const key=randomBytes(32),store=createConversationStore({directory,key});
  const a={organizationId:'org',userId:'alice',conversationId:'one'};
  const name=s=>createHash('sha256').update(JSON.stringify([s.organizationId,s.userId,s.conversationId])).digest('hex')+'.enc';
  await store.append(a,{role:'user',text:'private'});
  for(const b of [{...a,organizationId:'other'},{...a,userId:'bob'},{...a,conversationId:'two'}]){
   await fs.copyFile(path.join(directory,name(a)),path.join(directory,name(b)));
   await assert.rejects(store.read(b));
  }
  assert.equal((await store.read(a))[0].text,'private');
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});
test('legacy conversion requires a trusted digest and never silently resets stored records',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mana-v1-migration-'));
 try{
  const key=randomBytes(32),scope={organizationId:'org',userId:'alice',conversationId:'one'};
  const file=path.join(directory,createHash('sha256').update(JSON.stringify(['org','alice','one'])).digest('hex')+'.enc');
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
  const messages=[{role:'user',text:'keep this',at:'2026-10-26T00:00:00.000Z'}];
  const encrypted=Buffer.concat([cipher.update(JSON.stringify({version:1,messages})),cipher.final()]);
  const bytes=Buffer.concat([Buffer.from('MANA1'),nonce,cipher.getAuthTag(),encrypted]);
  const expectedSha256=createHash('sha256').update(bytes).digest('hex');
  await fs.writeFile(file,bytes);
  const store=createConversationStore({directory,key});
  await assert.rejects(store.read(scope),/verified migration/);
  await assert.rejects(store.append(scope,{role:'user',text:'new'}),/verified migration/);
  await assert.rejects(store.migrateLegacy(scope,{expectedSha256:'0'.repeat(64)}),/manifest/);
  assert.deepEqual(await fs.readFile(file),bytes);
  assert.deepEqual(await store.migrateLegacy(scope,{expectedSha256}),{migrated:true,messages:1});
  assert.deepEqual(await store.read(scope),messages);
  assert.deepEqual(await store.migrateLegacy(scope,{expectedSha256}),{migrated:false});
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});
test('scope and encryption key are snapshotted before queued writes',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mana-bound-scope-'));
 try{
  const key=randomBytes(32),originalKey=Buffer.from(key),store=createConversationStore({directory,key});
  const original={organizationId:'org',userId:'alice',conversationId:'one'},scope={...original};
  const pending=store.append(scope,{role:'user',text:'bound'});
  scope.userId='bob';key.fill(0);await pending;
  const reopened=createConversationStore({directory,key:originalKey});
  assert.equal((await reopened.read(original))[0].text,'bound');
  assert.deepEqual(await reopened.read(scope),[]);
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});
test('a held writer lock prevents a second store from replacing messages',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mana-conversation-lock-'));
 try{
  const key=randomBytes(32),scope={organizationId:'org',userId:'u',conversationId:'c'};
  const first=createConversationStore({directory,key}),second=createConversationStore({directory,key});
  await first.append(scope,{role:'user',text:'first'});
  const name=(await fs.readdir(directory))[0],lock=path.join(directory,name+'.lock');
  await fs.writeFile(lock,'');
  await assert.rejects(second.append(scope,{role:'user',text:'blocked'}),{code:'EEXIST'});
  assert.equal((await first.read(scope)).length,1);await fs.unlink(lock);
  await second.append(scope,{role:'assistant',text:'second'});
  assert.deepEqual((await first.read(scope)).map(x=>x.text),['first','second']);
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});
test('corrupted, oversized and symbolic-link records are rejected without replacement',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mana-record-boundaries-'));
 try{
  const key=randomBytes(32),store=createConversationStore({directory,key}),scope={organizationId:'org',userId:'u',conversationId:'c'};
  await store.append(scope,{role:'user',text:'original'});
  const file=path.join(directory,(await fs.readdir(directory))[0]),bytes=await fs.readFile(file);
  const broken=Buffer.from(bytes);broken[broken.length-1]^=1;await fs.writeFile(file,broken);
  await assert.rejects(store.append(scope,{role:'user',text:'must not replace'}));
  assert.deepEqual(await fs.readFile(file),broken);
  await fs.writeFile(file,Buffer.alloc(2*1024*1024+1));await assert.rejects(store.read(scope),/Invalid conversation file/);
  const target=path.join(directory,'target');await fs.writeFile(target,bytes);await fs.unlink(file);await fs.symlink(target,file);
  await assert.rejects(store.read(scope));
  assert.deepEqual(await fs.readFile(target),bytes);
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});
