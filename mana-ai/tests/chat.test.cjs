'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {chatConfig,sendChat}=require('../src/chat.cjs');
const token='a'.repeat(40);
test('chat only allows loopback HTTP service',()=>{
 assert.throws(()=>chatConfig({MANA_AI_TOKEN:token,MANA_AI_CHAT_URL:'https://example.com'}),/local HTTP/);
 assert.equal(chatConfig({MANA_AI_TOKEN:token}).baseUrl,'http://127.0.0.1:8787');
});
test('chat sends authenticated question and project session',async()=>{
 const config=chatConfig({MANA_AI_TOKEN:token,MANA_AI_CHAT_PROJECT_ID:'sample_project'});
 let request;
 const answer=await sendChat(config,'Hello',async(url,options)=>{
  request={url:String(url),options};return {ok:true,json:async()=>({answer:'سلام'})};
 });
 assert.equal(answer,'سلام');
 assert.equal(request.options.headers.Authorization,'Bearer '+token);
 assert.deepEqual(JSON.parse(request.options.body),{question:'Hello',projectId:'sample_project',sessionId:'local-chat'});
});
test('chat rejects oversized questions before sending',async()=>{
 let called=false;
 await assert.rejects(()=>sendChat(chatConfig({MANA_AI_TOKEN:token}),'x'.repeat(4001),async()=>{called=true;}),/Question/);
 assert.equal(called,false);
});
