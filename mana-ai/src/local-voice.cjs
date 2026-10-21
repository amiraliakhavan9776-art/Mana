'use strict';
// Speech adapter for a separately installed, locally hosted ASR/TTS service.
// Wire format is a Mana pilot contract, not a claim of compatibility with any vendor.
const MAX_AUDIO=2*1024*1024,MAX_TEXT=3000,MAX_RESPONSE=4*1024*1024;
function localBase(baseUrl){
 const u=new URL(baseUrl);
 if(u.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Voice endpoint must be local loopback HTTP');
 return u;
}
async function limited(response,limit){
 if(!response.ok)throw Error('Local voice provider error');
 const declared=Number(response.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>limit)throw Error('Voice response too large');
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length>limit)throw Error('Voice response too large');
 return bytes;
}
function createLocalVoiceProvider({baseUrl,fetchImpl=fetch}={}){
 const base=localBase(baseUrl);
 return {
  async transcribe({audio,signal}){
   if(!(audio instanceof Uint8Array)||audio.length<1||audio.length>MAX_AUDIO)throw Error('Invalid audio');
   const response=await fetchImpl(new URL('/v1/audio/transcriptions',base),{method:'POST',headers:{'Content-Type':'audio/webm','Accept':'application/json'},body:audio,signal,redirect:'error'});
   const bytes=await limited(response,MAX_TEXT*4);
   const parsed=JSON.parse(new TextDecoder().decode(bytes));
   if(typeof parsed.text!=='string'||parsed.text.length>MAX_TEXT)throw Error('Invalid transcript');
   return parsed.text;
  },
  async synthesize({text,signal}){
   if(typeof text!=='string'||!text.trim()||text.length>MAX_TEXT)throw Error('Invalid text');
   const response=await fetchImpl(new URL('/v1/audio/speech',base),{method:'POST',headers:{'Content-Type':'application/json','Accept':'audio/wav'},body:JSON.stringify({text,language:'fa',format:'wav'}),signal,redirect:'error'});
   const bytes=await limited(response,MAX_RESPONSE);
   if(bytes.length<12||String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(8,12))!=='WAVE')throw Error('Invalid WAV');
   return bytes;
  }
 };
}
module.exports={createLocalVoiceProvider,localBase,MAX_AUDIO};
