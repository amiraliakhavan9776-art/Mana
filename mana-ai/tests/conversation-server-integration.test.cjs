'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {start}=require('../local-chat-ui.cjs');
test('conversation routes are mounted only with trusted dependencies',async()=>{
 const messages=[];
 const store={read:async()=>messages,append:async(_scope,msg)=>messages.push(msg)};
 const provider={complete:async()=> 'ok'};
 assert.throws(()=>start({port:0,model:'test',provider,conversationStore:store}),/must be supplied together/);
 const server=start({port:0,model:'test',provider,conversationStore:store,authenticate:async()=>({
  userId:'user1',organizationId:'org1',canReadConversations:true,canWriteConversations:true,verifyCsrf:v=>v==='proof'
 })});
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const write=await fetch(base+'/api/conversations/chat1',{method:'POST',headers:{'Content-Type':'application/json','X-Mana-CSRF':'proof'},body:JSON.stringify({role:'user',text:'سلام'})});
  assert.equal(write.status,201);
  const read=await fetch(base+'/api/conversations/chat1');
  assert.equal(read.status,200);
  assert.equal((await read.json()).messages[0].text,'سلام');
 }finally{await new Promise(resolve=>server.close(resolve))}
});
