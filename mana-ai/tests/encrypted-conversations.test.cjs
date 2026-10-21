'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {randomBytes}=require('node:crypto');
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
