'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {start}=require('../local-chat-ui.cjs');
test('voice routes use injected local provider',async()=>{
 const server=start({port:0,model:'test-model',provider:{complete:async()=> 'سلام'},voiceProvider:{
  transcribe:async({audio})=>{assert.equal(audio.length,3);return 'سلام مانا'},
  synthesize:async({text})=>{assert.equal(text,'سلام');return new Uint8Array([82,73,70,70,0,0,0,0,87,65,86,69])}
 }});
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const asr=await fetch(base+'/api/voice/transcribe',{method:'POST',headers:{'Content-Type':'audio/webm'},body:new Uint8Array([1,2,3])});
  assert.equal(asr.status,200);assert.equal((await asr.json()).text,'سلام مانا');
  const tts=await fetch(base+'/api/voice/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'سلام'})});
  assert.equal(tts.status,200);assert.equal(tts.headers.get('content-type'),'audio/wav');
 }finally{await new Promise(resolve=>server.close(resolve))}
});
