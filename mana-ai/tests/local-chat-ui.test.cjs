'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {start}=require('../local-chat-ui.cjs');
test('loopback Persian chat works with injected fake local model',async()=>{
 const server=start({port:0,model:'local-test',provider:{complete:async()=> 'سلام از مانا'}});
 await new Promise(resolve=>server.once('listening',resolve));
 const addr=server.address();
 try{
   assert.equal(addr.address,'127.0.0.1');
   const url='http://127.0.0.1:'+addr.port;
   const page=await fetch(url);assert.equal(page.status,200);assert.match(await page.text(),/مانا AI/);
   const response=await fetch(url+'/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'chat',prompt:'سلام'})});
   assert.equal(response.status,200);assert.equal((await response.json()).answer,'سلام از مانا');
   const invalid=await fetch(url+'/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'chat',prompt:''})});
   assert.equal(invalid.status,400);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
