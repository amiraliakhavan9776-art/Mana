'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {start}=require('../local-chat-ui.cjs');
const {createSessionAuth,passwordRecord}=require('../src/session-auth.cjs');
test('authenticated chat persists two turns and recalls context',async()=>{
 const auth=createSessionAuth({accounts:[{userId:'alice',organizationId:'org1',...passwordRecord('test-password-long-123')}]});
 const rows=[],calls=[];
 const store={read:async()=>rows,append:async(scope,msg)=>{rows.push(msg)}};
 const server=start({port:0,model:'test',provider:{complete:async({messages})=>{calls.push(messages);return 'reply'}},sessionAuth:auth,conversationStore:store});
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const session=auth.login('alice','test-password-long-123');
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+session.token,'X-Mana-CSRF':session.csrf};
  const send=text=>fetch(base+'/api/chat/demo',{method:'POST',headers,body:JSON.stringify({prompt:text})});
  assert.equal((await send('first')).status,200);
  assert.deepEqual(rows.map(x=>x.role),['user','assistant']);
  assert.equal((await send('second')).status,200);
  assert.ok(calls[1].some(x=>x.role==='assistant'&&x.content==='reply'));
  const forbidden=await fetch(base+'/api/chat/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'bad'})});
  assert.equal(forbidden.status,403);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
