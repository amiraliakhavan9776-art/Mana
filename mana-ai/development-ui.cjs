'use strict';
// Adapted from the owner's mana-preview.cjs (2026-11-18). Staging only.
const http=require('node:http');
const {expensePage}=require('./src/pilot/expense-page.cjs');
const {reviewExpense}=require('./src/pilot/expense-review.cjs');
const {randomBytes,timingSafeEqual}=require('node:crypto');
function page(token,{jarvis=false,furnished=false}={}){return `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>مانا | اجرای مأموریت</title>
<style>body{font:17px/1.8 system-ui,sans-serif;color:#1f302d;background:#f4f6f3;margin:0}main{max-width:720px;margin:5vh auto;padding:24px}section{background:white;border:1px solid #dce5df;border-radius:16px;padding:24px;margin:16px 0}h1,h2{margin:0 0 10px}button{font:inherit;color:white;background:#245d50;border:0;border-radius:10px;padding:9px 23px;cursor:pointer}button:disabled{opacity:.65}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:0}ul{padding-inline-start:22px}.note{font-size:14px;color:#52635c}</style>
<main><a href="/expenses">بررسی صورت هزینه با درخواست فارسی</a><h1>مانا</h1><p>اجرای آزمایشی مأموریت‌های هسته</p>
<p class="note">این محیط آزمایشی است. قبولی آزمون به معنی تکمیل مانا یا مجوز انتشار روی سرور نیست. مدل و GPU لازم نیست.</p>
${jarvis?'<p><a href="/jarvis">جارویس: نقشه، متره و دفترچه</a></p>':''}
${furnished?'<p><a href="/furnished">معماری: دو گزینهٔ مبلمان‌دار و دفترچه</a></p>':''}
<section><h2>اجرای صف سند</h2><button id="run">برو جلو</button><p id="status" role="status">آمادهٔ اجرا</p><pre id="details"></pre></section>
<section><h2>سابقهٔ آزمون‌ها</h2><ul id="history"></ul></section></main>
<script>
const button=document.getElementById('run'),statusLine=document.getElementById('status'),details=document.getElementById('details'),list=document.getElementById('history');
const labels={BENCHMARK_PASSED:'آزمون قبول شد',REVIEW_REQUIRED:'نیازمند بازبینی',EXECUTION_BLOCKED:'اجرای آزمون متوقف شد',SUPPORTED_BENCHMARKS_COMPLETE:'مأموریت‌های متصل به این نسخه آزموده شده‌اند؛ سایر قابلیت‌های سند هنوز تکمیل نشده‌اند'};
async function history(){const res=await fetch('/history');if(!res.ok)throw Error('خواندن سابقه ممکن نبود.');const rows=await res.json();list.replaceChildren();if(!rows.length){const li=document.createElement('li');li.textContent='هنوز رسیدی ثبت نشده است.';list.append(li);}for(const row of rows){const li=document.createElement('li');li.textContent=row.title+' · '+(labels[row.status]||row.status);list.append(li);}}
button.onclick=async()=>{button.disabled=true;statusLine.textContent='در حال انتخاب و اجرای آزمون…';details.textContent='';try{const res=await fetch('/run',{method:'POST',headers:{'X-Mana-Token':'${token}'}});const r=await res.json();if(!res.ok)throw Error(r.error||'اجرای درخواست ممکن نبود.');statusLine.textContent=labels[r.status]||'وضعیت نامشخص';details.textContent=[r.mission?.title,r.selectedBecause,r.reason,r.output,r.reused?'رسید قبلی استفاده شد؛ آزمون دوباره اجرا نشد.':''].filter(Boolean).join('\\n');await history();}catch(e){statusLine.textContent=e.message;}finally{button.disabled=false;}};
history().catch(e=>{statusLine.textContent=e.message;});
</script></html>`;}
function start({port=8798,runner,jarvisSession,furnishedWorkspace,precedentSearchEndpoint}={}){
 if(!Number.isInteger(port)||port<0||port>65535||!runner||typeof runner.run!=='function'||typeof runner.history!=='function')throw Error('Invalid development UI configuration');
 const token=randomBytes(32).toString('hex');let busy=false;
 const jarvis=jarvisSession?require('./jarvis-preview.cjs').createHandler(jarvisSession,{basePath:'/jarvis',getPort:()=>server.address().port}):null;
 const furnished=furnishedWorkspace?require('./src/furnished/pilot.cjs').createFurnishedHandler({workspace:furnishedWorkspace,getPort:()=>server.address().port,discoveryEndpoint:precedentSearchEndpoint}):null;
 const server=http.createServer(async(req,res)=>{
  const send=(status,type,body)=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(body)};
  const json=(code,data)=>send(code,'application/json; charset=utf-8',JSON.stringify(data));
  const host='127.0.0.1:'+server.address().port;
  if(req.headers.host!==host)return json(403,{error:'نشانی رابط معتبر نیست.'});
  if(jarvis&&(req.url==='/jarvis'||req.url.startsWith('/jarvis/'))){await jarvis(req,res);return;}
  if(furnished&&(req.url==='/furnished'||req.url.startsWith('/furnished/'))){await furnished(req,res);return;}
  if(req.method==='GET'&&req.url==='/expenses')return send(200,'text/html; charset=utf-8',expensePage(token));
  if(req.method==='GET'&&req.url==='/')return send(200,'text/html; charset=utf-8',page(token,{jarvis:Boolean(jarvis),furnished:Boolean(furnished)}));
  if(req.method==='GET'&&req.url==='/history'){try{return json(200,runner.history());}catch{return json(503,{error:'خواندن سابقه ممکن نبود؛ وضعیت موجود حفظ شد.'});}}
  if(req.method!=='POST'||!['/run','/expenses/review'].includes(req.url))return json(404,{error:'مسیر پیدا نشد.'});
  const supplied=Buffer.from(typeof req.headers['x-mana-token']==='string'?req.headers['x-mana-token']:'');
  if(req.headers.origin!=='http://'+host||supplied.length!==token.length||!timingSafeEqual(supplied,Buffer.from(token)))return json(403,{error:'درخواست اجرا معتبر نیست.'});
  if(req.url==='/expenses/review'){
   if(req.headers['content-type']!=='application/json')return json(415,{error:'ورودی JSON لازم است.'});
   try{
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>120000){json(413,{error:'درخواست بزرگ‌تر از حد مجاز است.'});req.destroy();return;}chunks.push(chunk);}
    const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
    return json(200,reviewExpense(JSON.parse(text)));
   }catch(e){return json(400,{error:e instanceof SyntaxError?'ساختار JSON نامعتبر است.':e.message});}
  }
  if(req.headers['transfer-encoding']||Number(req.headers['content-length']||0)!==0)return json(400,{error:'فرمان اجرا ورودی اضافی نمی‌پذیرد.'});
  if(busy)return json(409,{error:'یک مأموریت در حال اجراست.'});
  busy=true;try{return json(200,await runner.run());}catch{return json(503,{error:'اجرای مأموریت متوقف شد؛ گزارش و وضعیت را پیش از تلاش بعدی بررسی کن.'});}finally{busy=false;}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;server.listen(port,'127.0.0.1');return server;
}
if(require.main===module){
 const {createDevelopmentRunner}=require('./src/development/runner.cjs');
 const runner=createDevelopmentRunner({workspace:process.env.MANA_DEVELOPMENT_WORKSPACE});
 const jarvisPath=process.env.MANA_JARVIS_PREVIEW_WORKSPACE;
 const furnishedWorkspace=process.env.MANA_FURNISHED_WORKSPACE;
 const {resolve,sep}=require('node:path'),workspaces=[process.env.MANA_DEVELOPMENT_WORKSPACE,jarvisPath,furnishedWorkspace].filter(Boolean).map(p=>resolve(p));
 if(workspaces.some((a,i)=>workspaces.some((b,j)=>i<j&&(a===b||a.startsWith(b+sep)||b.startsWith(a+sep)))))throw Error('Staging workspaces must be separate');
 const jarvisSession=jarvisPath?require('./src/jarvis-preview/session.cjs').createSession({workspace:jarvisPath}):undefined;
 try{
  const server=start({port:Number(process.env.MANA_DEVELOPMENT_PORT||8798),runner,jarvisSession,furnishedWorkspace,precedentSearchEndpoint:process.env.MANA_PRECEDENT_SEARCH_URL});
  server.once('listening',()=>console.log('MANA staging: http://127.0.0.1:'+server.address().port));
  if(jarvisSession){server.once('close',()=>jarvisSession.close());server.once('error',error=>{jarvisSession.close();console.error(error.message);process.exitCode=1;});for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());}
 }catch(error){jarvisSession?.close();throw error;}
}
module.exports={start,page};
