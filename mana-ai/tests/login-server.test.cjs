'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {start}=require('../local-chat-ui.cjs');
const {createSessionAuth,passwordRecord}=require('../src/session-auth.cjs');
test('login issues scoped session usable for conversation API',async()=>{
 const auth=createSessionAuth({accounts:[{userId:'alice',organizationId:'org1',...passwordRecord('long-password-for-testing')}]});
 const messages=[];
 const store={read:async()=>messages,append:async(_,message)=>messages.push(message)};
 const server=start({port:0,provider:{complete:async()=> 'ok'},model:'test',conversationStore:store,sessionAuth:auth});
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:'alice',password:'long-password-for-testing'})});
  assert.equal(response.status,200);
  const {token,csrf}=await response.json();
  const result=await fetch(base+'/api/conversations/demo',{method:'POST',headers:{Authorization:'Bearer '+token,'X-Mana-CSRF':csrf,'Content-Type':'application/json'},body:JSON.stringify({role:'user',text:'سلام مانا'})});
  assert.equal(result.status,201);
  const read=await fetch(base+'/api/conversations/demo',{headers:{Authorization:'Bearer '+token}});
  assert.equal((await read.json()).messages[0].text,'سلام مانا');
  const denied=await fetch(base+'/api/conversations/demo');
  assert.equal(denied.status,403);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
