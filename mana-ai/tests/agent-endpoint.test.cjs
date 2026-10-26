'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('../src/server.cjs');
const token='agent-endpoint-test-token-32-characters';
async function withServer(fn){
 const server=createServer({token,principals:[{id:'a',orgId:'local',role:'viewer',token,projectIds:['p1']}],projects:[{id:'p1',orgId:'local',name:'One'},{id:'p2',orgId:'other',name:'Two'}],documents:[{id:'d1',orgId:'local',projectId:'p1',title:'Budget',text:'Budget approved'},{id:'d2',orgId:'other',projectId:'p2',title:'Budget',text:'Secret budget'}]});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {await fn('http://127.0.0.1:'+server.address().port+'/v1/agent/documents/search');}
 finally {await new Promise(resolve=>server.close(resolve));}
}
const send=(url,body,auth=true)=>fetch(url,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
test('document endpoint is authenticated and only returns same-tenant data',()=>withServer(async url=>{
 assert.equal((await send(url,{projectId:'p1',question:'Budget'},false)).status,401);
 const ok=await send(url,{projectId:'p1',question:'Budget'});
 assert.equal(ok.status,200);
 const data=await ok.json();
 assert.equal(data.sources.length,1);assert.equal(data.sources[0].documentId,'d1');
 assert.equal(JSON.stringify(data).includes('Secret'),false);
 assert.equal((await send(url,{projectId:'p2',question:'Budget'})).status,404);
}));
test('document endpoint rejects injected context and oversized requests',()=>withServer(async url=>{
 assert.equal((await send(url,{projectId:'p1',question:'Budget',documents:[]})).status,400);
 assert.equal((await send(url,{projectId:'p1',question:'x'.repeat(5000)})).status,413);
}));
