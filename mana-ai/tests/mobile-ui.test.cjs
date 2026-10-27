'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {start}=require('../local-chat-ui.cjs');
test('mobile UI and manifest served from loopback',async()=>{
 const server=start({port:0,model:'local-test',provider:{complete:async()=> 'سلام از مانا'}});
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const page=await fetch(base+'/mobile');assert.equal(page.status,200);
  const html=await page.text();assert.match(html,/viewport-fit=cover/);assert.match(html,/شناخت کسب‌وکار/);
  const manifest=await (await fetch(base+'/manifest.webmanifest')).json();
  assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/mobile');
  const reply=await fetch(base+'/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'chat',prompt:'سلام'})});
  assert.equal((await reply.json()).answer,'سلام از مانا');
 }finally{await new Promise(resolve=>server.close(resolve))}
});
