'use strict';
const http=require('node:http');
const {createLocalOpenAICompatibleProvider}=require('./src/engine.cjs');
const {planBusiness}=require('./src/autopilot-orchestrator.cjs');
const {html:mobileHtml,manifest}=require('./mobile-ui.cjs');
const {createLocalVoiceProvider}=require('./src/local-voice.cjs');
const {createConversationApi}=require('./src/conversation-api.cjs');
const HOST='127.0.0.1', PORT=Number(process.env.MANA_AI_CHAT_PORT||8790);
const MAX=12000;
const html=`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mana AI آزمایشی</title><style>body{font:16px system-ui;background:#101827;color:#f5f5f5;max-width:800px;margin:3rem auto;padding:1rem}main{background:#1b2839;padding:1.5rem;border-radius:18px}textarea,input,button,select{font:inherit;border-radius:9px;padding:.65rem}textarea,input,select{background:#f9fafb;color:#101827;border:0;width:100%;box-sizing:border-box}button{background:#60d3c1;border:0;cursor:pointer}pre{white-space:pre-wrap;word-break:break-word;background:#0b1220;padding:1rem;border-radius:10px;min-height:120px}label{display:block;margin:.7rem 0}</style></head><body><main><h1>مانا AI — نسخه آزمایشی محلی</h1><p>این نسخه فقط روی همین دستگاه قابل دسترسی است. به مدل محلی نیاز دارد؛ هیچ داده‌ای به سرویس خارجی ارسال نمی‌شود.</p><label>حالت<select id="mode"><option value="chat">گفتگو</option><option value="plan">طرح کسب‌وکار</option></select></label><label>نام سازمان (برای طرح کسب‌وکار)<input id="org" placeholder="مثلاً مانا"></label><label>درخواست / شغل و هدف<textarea id="prompt" rows="5" placeholder="چه کاری از مانا می‌خواهید؟"></textarea></label><button id="send">ارسال</button><pre id="out" aria-live="polite">آماده</pre></main><script>document.getElementById('send').onclick=async()=>{const b=document.getElementById('send'),o=document.getElementById('out');b.disabled=true;o.textContent='در حال پردازش...';try{const res=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:document.getElementById('mode').value,organization:document.getElementById('org').value,prompt:document.getElementById('prompt').value})});const data=await res.json();o.textContent=data.answer||JSON.stringify(data,null,2)}catch(e){o.textContent='خطای ارتباط با مانا'}finally{b.disabled=false}}</script></body></html>`;
function start({port=PORT,provider,model,voiceProvider,conversationStore,authenticate,sessionAuth}={}){
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid port');
 if(!provider||typeof provider.complete!=='function')throw Error('Local provider required');
 if(typeof model!=='string'||!/^[a-zA-Z0-9._:/-]{1,100}$/.test(model))throw Error('Invalid model');
 if(sessionAuth&&(!conversationStore||authenticate))throw Error('Session authentication requires store and no separate authenticator');
 if(sessionAuth)authenticate=req=>sessionAuth.authenticate(req);
 if(Boolean(conversationStore)!==Boolean(authenticate))throw Error('Conversation store and trusted authenticator must be supplied together');
 const conversationApi=conversationStore?createConversationApi({store:conversationStore,authenticate}):null;
 const server=http.createServer(async(req,res)=>{
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'");
   if(req.method==='GET'&&req.url==='/mobile'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(mobileHtml)}
   if(req.method==='GET'&&req.url==='/manifest.webmanifest'){res.writeHead(200,{'Content-Type':'application/manifest+json; charset=utf-8'});return res.end(JSON.stringify(manifest))}
   if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html)}
   if(sessionAuth&&req.url==='/api/auth/logout'&&req.method==='POST'){
     const principal=sessionAuth.authenticate(req);
     if(!principal||!principal.verifyCsrf(req.headers['x-mana-csrf'])){res.writeHead(403);return res.end()}
     const token=(req.headers.authorization||'').slice(7);sessionAuth.revoke(token);
     res.writeHead(204);return res.end();
   }
   if(sessionAuth&&req.url==='/api/auth/login'&&req.method==='POST'){
     if(req.headers.origin&&req.headers.origin!==`http://${HOST}:${port}`){res.writeHead(403);return res.end()}
     if(req.headers['content-type']?.split(';')[0]!=='application/json'){res.writeHead(415);return res.end()}
     let size=0,chunks=[];
     try{
       for await(const chunk of req){size+=chunk.length;if(size>1500)throw Error('Too large');chunks.push(chunk)}
       const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
       const session=sessionAuth.login(body.userId,body.password);
       if(!session){res.writeHead(401,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Invalid credentials'}))}
       res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(session));
     }catch{res.writeHead(400);return res.end()}
   }
   if(sessionAuth&&conversationStore&&req.method==='POST'&&/^\/api\/chat\/[A-Za-z0-9_-]{1,100}$/.test(req.url||'')){
     const principal=sessionAuth.authenticate(req);
     const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
     if(!principal||!principal.verifyCsrf(req.headers['x-mana-csrf'])){send(403,{error:'Access denied'});return}
     if(req.headers.origin&&req.headers.origin!==`http://${HOST}:${port}`){send(403,{error:'Origin denied'});return}
     if(req.headers['content-type']?.split(';')[0]!=='application/json'){send(415,{error:'JSON required'});return}
     let size=0,chunks=[];
     try{
       for await(const chunk of req){size+=chunk.length;if(size>6000)throw Error('Request too large');chunks.push(chunk)}
       const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
       if(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>4000)throw Error('Invalid prompt');
       const scope={userId:principal.userId,organizationId:principal.organizationId,conversationId:req.url.split('/')[3]};
       const history=await conversationStore.read(scope);
       const context=history.slice(-20).filter(m=>['user','assistant'].includes(m.role)&&typeof m.text==='string').map(m=>({role:m.role,content:m.text}));
       const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
       let answer;
       try{answer=await provider.complete({model,messages:[{role:'system',content:'You are Mana AI local experimental assistant. Answer in Persian. Do not claim actions were executed.'},...context,{role:'user',content:body.prompt}],signal:controller.signal})}
       finally{clearTimeout(timer)}
       if(typeof answer!=='string'||!answer.trim()||answer.length>16000)throw Error('Invalid model response');
       await conversationStore.append(scope,{role:'user',text:body.prompt});
       await conversationStore.append(scope,{role:'assistant',text:answer});
       send(200,{answer,model,conversationId:scope.conversationId,actionsExecuted:0});
     }catch{send(400,{error:'Chat processing failed'});}
     return;
   }
   if(conversationApi && await conversationApi(req,res))return;
   if(req.method==='POST'&&['/api/voice/transcribe','/api/voice/speak'].includes(req.url)){
     if(!voiceProvider){res.writeHead(503);return res.end()}
     if(req.headers.origin&&req.headers.origin!==`http://${HOST}:${port}`){res.writeHead(403);return res.end()}
     const isAsr=req.url.endsWith('transcribe');
     if(req.headers['content-type']?.split(';')[0]!== (isAsr?'audio/webm':'application/json')){res.writeHead(415);return res.end()}
     let chunks=[],size=0;
     try{
       for await(const chunk of req){size+=chunk.length;if(size>(isAsr?2*1024*1024:12000))throw Error('Request too large');chunks.push(chunk)}
       const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
       try{
         const body=Buffer.concat(chunks);
         if(isAsr){
           const text=await voiceProvider.transcribe({audio:new Uint8Array(body),signal:controller.signal});
           res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({text}));
         }
         const parsed=JSON.parse(body.toString('utf8'));
         const wav=await voiceProvider.synthesize({text:parsed.text,signal:controller.signal});
         res.writeHead(200,{'Content-Type':'audio/wav'});return res.end(Buffer.from(wav));
       }finally{clearTimeout(timer)}
     }catch{res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Voice processing failed'}))}
   }
   if(req.method!=='POST'||req.url!=='/api/ask'){res.writeHead(404);return res.end()}
   if(req.headers.origin && req.headers.origin!==`http://${HOST}:${port}`){res.writeHead(403);return res.end()}
   if(req.headers['content-type']?.split(';')[0]!=='application/json'){res.writeHead(415);return res.end()}
   let size=0,raw='';
   try{
     for await(const chunk of req){size+=chunk.length;if(size>MAX)throw Error('Request too large');raw+=chunk}
     const body=JSON.parse(raw);
     if(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>4000)throw Error('Invalid prompt');
     const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
     try{
       let output;
       if(body.mode==='plan'){
         if(typeof body.organization!=='string'||!body.organization.trim()||body.organization.length>180)throw Error('Organization required');
         output=await planBusiness({input:{organization:body.organization,profession:body.prompt,goals:[]},provider,model,signal:controller.signal});
       }else if(body.mode==='chat'){
         const answer=await provider.complete({model,messages:[{role:'system',content:'You are Mana AI local experimental assistant. Be helpful in Persian. No tools, company data, internet or action permissions. Never claim actions were executed.'},{role:'user',content:body.prompt}],signal:controller.signal});
         if(typeof answer!=='string'||answer.length>16000)throw Error('Invalid model response');
         output={answer,model,actionsExecuted:0};
       }else throw Error('Invalid mode');
       res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(output));
     }finally{clearTimeout(timer)}
   }catch(e){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'Request failed: '+e.message}))}
 });
 server.listen(port,HOST);return server;
}
if(require.main===module){
 const url=process.env.MANA_AI_LOCAL_PROVIDER_URL,model=process.env.MANA_AI_MODEL;
 if(!url||!model)throw Error('Set MANA_AI_LOCAL_PROVIDER_URL and MANA_AI_MODEL');
 const provider=createLocalOpenAICompatibleProvider({baseUrl:url});
 const voiceProvider=process.env.MANA_AI_LOCAL_VOICE_URL?createLocalVoiceProvider({baseUrl:process.env.MANA_AI_LOCAL_VOICE_URL}):undefined;
 start({provider,model,voiceProvider});console.log('Mana local chat: http://127.0.0.1:'+PORT);
}
module.exports={start};
