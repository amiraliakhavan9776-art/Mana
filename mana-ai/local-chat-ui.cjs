'use strict';
const http=require('node:http');
const {createLocalOpenAICompatibleProvider}=require('./src/engine.cjs');
const {planBusiness}=require('./src/autopilot-orchestrator.cjs');
const HOST='127.0.0.1', PORT=Number(process.env.MANA_AI_CHAT_PORT||8790);
const MAX=12000;
const html=`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mana AI آزمایشی</title><style>body{font:16px system-ui;background:#101827;color:#f5f5f5;max-width:800px;margin:3rem auto;padding:1rem}main{background:#1b2839;padding:1.5rem;border-radius:18px}textarea,input,button,select{font:inherit;border-radius:9px;padding:.65rem}textarea,input,select{background:#f9fafb;color:#101827;border:0;width:100%;box-sizing:border-box}button{background:#60d3c1;border:0;cursor:pointer}pre{white-space:pre-wrap;word-break:break-word;background:#0b1220;padding:1rem;border-radius:10px;min-height:120px}label{display:block;margin:.7rem 0}</style></head><body><main><h1>مانا AI — نسخه آزمایشی محلی</h1><p>این نسخه فقط روی همین دستگاه قابل دسترسی است. به مدل محلی نیاز دارد؛ هیچ داده‌ای به سرویس خارجی ارسال نمی‌شود.</p><label>حالت<select id="mode"><option value="chat">گفتگو</option><option value="plan">طرح کسب‌وکار</option></select></label><label>نام سازمان (برای طرح کسب‌وکار)<input id="org" placeholder="مثلاً مانا"></label><label>درخواست / شغل و هدف<textarea id="prompt" rows="5" placeholder="چه کاری از مانا می‌خواهید؟"></textarea></label><button id="send">ارسال</button><pre id="out" aria-live="polite">آماده</pre></main><script>document.getElementById('send').onclick=async()=>{const b=document.getElementById('send'),o=document.getElementById('out');b.disabled=true;o.textContent='در حال پردازش...';try{const res=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:document.getElementById('mode').value,organization:document.getElementById('org').value,prompt:document.getElementById('prompt').value})});const data=await res.json();o.textContent=data.answer||JSON.stringify(data,null,2)}catch(e){o.textContent='خطای ارتباط با مانا'}finally{b.disabled=false}}</script></body></html>`;
function start({port=PORT,provider,model}={}){
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
 if(!provider||typeof provider.complete!=='function')throw Error('Local provider required');
 if(typeof model!=='string'||!/^[a-zA-Z0-9._:/-]{1,100}$/.test(model))throw Error('Invalid model');
 const server=http.createServer(async(req,res)=>{
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'");
   if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html)}
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
 start({provider,model});console.log('Mana local chat: http://127.0.0.1:'+PORT);
}
module.exports={start};
