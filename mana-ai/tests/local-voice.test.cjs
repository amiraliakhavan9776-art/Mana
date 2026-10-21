'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLocalVoiceProvider,localBase}=require('../src/local-voice.cjs');
test('rejects external speech services',()=>{
 for(const url of ['https://example.com/','http://192.168.1.3:9000/','http://127.0.0.1:9000/secret'])assert.throws(()=>localBase(url));
});
test('ASR uses local-only request and returns Persian text',async()=>{
 let called=false;
 const voice=createLocalVoiceProvider({baseUrl:'http://127.0.0.1:9000/',fetchImpl:async(url,options)=>{
  called=true;assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/v1/audio/transcriptions');assert.equal(options.redirect,'error');
  return new Response(JSON.stringify({text:'سلام مانا'}),{headers:{'content-type':'application/json'}});
 }});
 assert.equal(await voice.transcribe({audio:new Uint8Array([1,2,3])}),'سلام مانا');assert.ok(called);
});
test('TTS requires valid WAV data',async()=>{
 const wav=new Uint8Array(16);wav.set(new TextEncoder().encode('RIFF'),0);wav.set(new TextEncoder().encode('WAVE'),8);
 const voice=createLocalVoiceProvider({baseUrl:'http://localhost:9000/',fetchImpl:async()=>new Response(wav)});
 assert.equal((await voice.synthesize({text:'سلام'})).length,16);
});
test('invalid speech output is rejected',async()=>{
 const voice=createLocalVoiceProvider({baseUrl:'http://localhost:9000/',fetchImpl:async()=>new Response('not wave')});
 await assert.rejects(voice.synthesize({text:'سلام'}),/Invalid WAV/);
});
