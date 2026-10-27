'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {createConversationApi}=require('../src/conversation-api.cjs');
function request(method,url,body={},headers={}){
 const req=Readable.from([Buffer.from(JSON.stringify(body))]);
 req.method=method;req.url=url;req.headers=headers;return req;
}
function response(){
 const out={headers:{},status:null,data:null};
 out.setHeader=(k,v)=>{out.headers[k]=v};
 out.writeHead=(status)=>{out.status=status};
 out.end=(data)=>{out.data=data?JSON.parse(data):null};
 return out;
}
test('rejects missing identity and prevents user-supplied organization overrides',async()=>{
 const scopes=[];
 const store={read:async scope=>{scopes.push(scope);return []},append:async()=>{}};
 const api=createConversationApi({store,authenticate:async()=>({userId:'alice',organizationId:'org1',canReadConversations:true,canWriteConversations:true,verifyCsrf:x=>x==='valid'})});
 const res=response();
 await api(request('GET','/api/conversations/chat1?organizationId=org2'),res);
 assert.equal(res.status,200);assert.equal(scopes[0].organizationId,'org1');
 const bad=response();
 await api(request('POST','/api/conversations/chat1',{role:'user',text:'hi'},{'content-type':'application/json','x-mana-csrf':'wrong'}),bad);
 assert.equal(bad.status,403);
 const unauthorized=createConversationApi({store,authenticate:async()=>null});
 const no=response();await unauthorized(request('GET','/api/conversations/chat1'),no);
 assert.equal(no.status,403);
});
test('writes only user messages with valid CSRF proof',async()=>{
 const writes=[];
 const store={read:async()=>[],append:async(scope,message)=>writes.push({scope,message})};
 const api=createConversationApi({store,authenticate:async()=>({userId:'alice',organizationId:'org1',canReadConversations:true,canWriteConversations:true,verifyCsrf:x=>x==='valid'})});
 const res=response();
 await api(request('POST','/api/conversations/chat1',{role:'user',text:'سلام'},{'content-type':'application/json','x-mana-csrf':'valid'}),res);
 assert.equal(res.status,201);assert.equal(writes[0].message.text,'سلام');
 const reject=response();
 await api(request('POST','/api/conversations/chat1',{role:'assistant',text:'fake'},{'content-type':'application/json','x-mana-csrf':'valid'}),reject);
 assert.equal(reject.status,400);
});
