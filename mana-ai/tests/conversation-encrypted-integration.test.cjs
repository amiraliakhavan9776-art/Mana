'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createConversationStore}=require('../src/encrypted-conversations.cjs');
const {createConversationApi}=require('../src/conversation-api.cjs');
const {randomBytes,createHash}=require('node:crypto');
const {Readable}=require('node:stream');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
test('conversation API separates encrypted records by authenticated identity',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mana-api-'));
 try{
  const store=createConversationStore({directory,key:randomBytes(32)});
  let principal={userId:'alice',organizationId:'org1',canReadConversations:true,canWriteConversations:true,verifyCsrf:proof=>proof==='proof'};
  const api=createConversationApi({store,authenticate:async()=>principal});
  async function call(method,body){
   const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
   req.url='/api/conversations/shared';req.method=method;
   req.headers={'content-type':'application/json','x-mana-csrf':'proof'};
   const res={setHeader(){},writeHead(status){this.status=status},end(data){this.body=JSON.parse(data)}};
   await api(req,res);return res;
  }
  assert.equal((await call('POST',{role:'user',text:'سلام'})).status,201);
  assert.equal((await call('GET')).body.messages.length,1);
  principal={...principal,userId:'bob'};
  assert.deepEqual((await call('GET')).body.messages,[]);
  const fileFor=user=>path.join(directory,createHash('sha256').update(JSON.stringify(['org1',user,'shared'])).digest('hex')+'.enc');
  await fs.copyFile(fileFor('alice'),fileFor('bob'));
  const transplanted=await call('GET');
  assert.equal(transplanted.status,500);
  assert.deepEqual(transplanted.body,{error:'Conversation unavailable'});
  assert.equal((await call('POST',{role:'user',text:'must not overwrite'})).status,400);
  principal={...principal,userId:'alice'};
  assert.equal((await call('GET')).body.messages.length,1);
  principal={...principal,userId:'alice',organizationId:'org2'};
  assert.deepEqual((await call('GET')).body.messages,[]);
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});
