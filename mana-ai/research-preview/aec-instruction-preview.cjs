'use strict';
const http=require('node:http'),path=require('node:path'),{randomBytes,timingSafeEqual}=require('node:crypto');
const {APPROVED_PERSIAN_COMMAND}=require('./persian-intake.cjs');
const {createAecInstructionRunner,readBound}=require('./aec-instruction-runner.cjs');
function page(token,selectionCommand,receiptReview){const selecting=!!selectionCommand;return `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>مانا | مأموریت پژوهشی</title><style>body{background:#f4f6f3;color:#1f302d;font:17px/1.8 system-ui;margin:0}main{max-width:720px;margin:4vh auto;padding:20px}section{background:white;border:1px solid #dce5df;border-radius:16px;padding:20px}textarea,button{font:inherit}textarea{box-sizing:border-box;width:100%;min-height:9rem;padding:9px;border:1px solid #697c73;border-radius:8px}button{color:white;background:#245d50;border:none;border-radius:10px;padding:8px 22px;cursor:pointer}button:disabled{opacity:.6}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}h1{line-height:1.4}</style>
<main><h1>مانا | پژوهش از روی سند</h1><section><label for="instruction">دستور فارسی مأموریت</label><textarea id="instruction" maxlength="768">${selectionCommand??APPROVED_PERSIAN_COMMAND}</textarea>
<p>${receiptReview?'پیش‌نمایش فقط‌خواندنی روی CPU. مانا فقط رسیدهای قبلی دو آزمون صف سند را بررسی می‌کند. هیچ دریافت تازه، اجرای مأموریت یا فعال‌سازی انجام نمی‌شود.':selecting?'پیش‌نمایش روی CPU. مانا از بین دو آزمون بازبینی‌شده در صف سند انتخاب می‌کند؛ هیچ مهارتی فعال نمی‌شود.':'پیش‌نمایش روی CPU. فقط درخواست بازبینی‌شدهٔ متره را می‌پذیرد و هیچ مهارتی را فعال نمی‌کند.'}</p>
<button id="run">برو جلو</button><p id="status" role="status">${receiptReview?'آمادهٔ بررسی رسیدها':'آمادهٔ اجرا'}</p><pre id="details"></pre><div id="progress"></div></section></main>
<script>
const statusLine=document.querySelector('#status'),details=document.querySelector('#details'),button=document.querySelector('#run');
const labels={RECEIPT_UNVERIFIED:'رسید معتبر در دسترس نیست؛ چیزی اجرا نشد.',AWAITING_HUMAN_REVIEW:'نیازمند بازبینی',TEST_NOT_PASSED:'پیشنهاد آزمون را نگذرانده',SOURCE_BLOCKED:'منبع رسمی قابل تأیید نبود؛ پیشنهادی ساخته نشد.',UNKNOWN_OUTCOME:'اجرای قبلی نتیجهٔ قطعی ندارد؛ تکرار نمی‌شود.',REJECTED:'دستور خارج از محدودهٔ بازبینی‌شده است.',READY:'آمادهٔ اجرا',NO_READY_CASE:'مأموریت آمادهٔ دیگری در محدودهٔ این پیش‌نمایش نیست.'};
const sourceFailures={
 INDOT_HTTPS_TIMEOUT:'پاسخ ناشر در زمان مجاز نرسید.',
 INDOT_HTTPS_REQUEST_FAILED:'اتصال به ناشر رسمی برقرار نشد.',
 INDOT_HTTPS_STATUS_REJECTED:'ناشر پاسخ مورد انتظار را نداد.',
 INDOT_HTTPS_INCOMPLETE:'فایل ناشر کامل دریافت نشد.',
 INDOT_LINK_NOT_APPROVED:'پیوند ناشر با پیوند بازبینی‌شده یکی نبود.',
 INDOT_LINK_MISSING_OR_AMBIGUOUS:'پیوند یکتای راهنما در فهرست رسمی پیدا نشد.',
 INDOT_PDF_REVISION_MISMATCH:'نسخهٔ PDF تغییر کرده و نیاز به بازبینی دارد.',
 INDOT_PYMUPDF_REQUIRED:'خوانندهٔ PDF در Python تعیین‌شده پیدا نشد.',
 INDOT_EXTRACTOR_START_FAILED:'خوانندهٔ PDF اجرا نشد.',
 INDOT_EXTRACTOR_TIMEOUT:'خواندن صفحه در زمان مجاز پایان نیافت.',
 INDOT_EXTRACTOR_FAILED:'خواندن صفحه نتیجهٔ قابل‌تأیید نداد.',
 INDOT_SOURCE_UNVERIFIED:'تطبیق منبع یا محتوای صفحه تأیید نشد.'
};
let runStarted=false;
const num=n=>new Intl.NumberFormat('fa-IR',{useGrouping:false}).format(n);
function show(r){if(!r)return;const progress=document.querySelector('#progress');if(progress)progress.textContent=typeof r.validatedCount==='number'?'رسید معتبر: '+num(r.validatedCount)+' از '+num(r.reviewedCount)+(r.nextCaseId?'؛ یک آزمون دیگر آمادهٔ انتخاب است.':''):'';statusLine.textContent=labels[r.status]||'وضعیت نامشخص';details.textContent=[r.title,r.selectedBecause,r.retryAvailable&&'مانا در اجرای بعدی خودش فقط همین دریافت را یک‌بار تکرار می‌کند. قبولی قبلی حفظ می‌شود.',r.recoveryAttempt&&'این نتیجهٔ تلاش دوبارهٔ ماناست. گزارش تلاش اول حفظ شده است.',Object.hasOwn(sourceFailures,r.sourceFailureCode)&&sourceFailures[r.sourceFailureCode],r.missionId&&'شناسهٔ ردیف صف: '+r.missionId,...(Array.isArray(r.completed)?r.completed.map(x=>x.title+' · '+num(x.passed)+' از '+num(x.total)):[]),r.sourceUrl,r.sourceUrl&&(r.receiptReview?'منبع رسمیِ دریافت‌شده در اجرای قبلی؛ این صفحه دریافت تازه‌ای ندارد.':r.sourceMode==='host-mediated'?'دریافت زنده از ناشر با رابط میزبان':['official-https','direct'].includes(r.sourceMode)?'دریافت مستقیم از ناشر رسمی':'بازپخش مدرک پین‌شده؛ بدون دریافت زنده'),r.total==null?'':(r.receiptReview?'آزمون مستقل اجرای قبلی روی CPU: ':'آزمون مستقل روی CPU: ')+num(r.passed)+' از '+num(r.total),r.receiptReview&&r.sourceSha256&&'SHA-256 صفحهٔ رسمی: '+r.sourceSha256,r.receiptReview&&r.indexSha256&&'SHA-256 فهرست رسمی: '+r.indexSha256,r.receiptReview&&r.gradeSha256&&'SHA-256 نتیجهٔ آزمون: '+r.gradeSha256,r.candidateSha256&&'شناسهٔ پیشنهاد: '+r.candidateSha256,r.status==='AWAITING_HUMAN_REVIEW'&&(r.receiptReview?'پیشنهاد در اجرای قبلی برای بازبینی ثبت شد؛ چیزی فعال نشده است.':'پیشنهاد برای بازبینی ذخیره شد؛ چیزی فعال نشده است.'),r.reused&&r.status!=='NO_READY_CASE'&&'رسید قبلی استفاده شد؛ مأموریت دوباره اجرا نشد.'].filter(Boolean).join('\\n');}
async function load(url,opts){const res=await fetch(url,opts);const r=await res.json();if(!res.ok)throw Error(r.error);return r;}
button.onclick=async()=>{if(button.disabled)return;runStarted=true;button.disabled=true;statusLine.textContent='${receiptReview?'در حال بررسی رسیدهای ثبت‌شده…':'در حال پژوهش و ارزیابی…'}';details.textContent='';try{show(await load('/run',{method:'POST',headers:{'Content-Type':'application/json','X-Mana-Token':'${token}'},body:JSON.stringify({instruction:document.querySelector('#instruction').value})}));}catch(e){statusLine.textContent=e.message;}finally{button.disabled=false;}};
load('/history').then(r=>{if(!runStarted)show(r);}).catch(e=>{if(!runStarted)statusLine.textContent=e.message;});
</script></html>`;}
function start({port=0,runner,missionSelection=false,receiptReview=false}){
 const selectionCommand=missionSelection?require('./mission-selection-runner.cjs').APPROVED_MISSION_SELECTION_COMMAND:undefined;
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('INVALID_PORT');
 const token=randomBytes(32).toString('hex');
 const server=http.createServer(async(req,res)=>{
  const send=(code,type,body)=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});res.end(body);};
  const json=(code,data)=>send(code,'application/json; charset=utf-8',JSON.stringify(data));
  const host='127.0.0.1:'+server.address().port;
  if(req.headers.host!==host||req.headers['sec-fetch-site']==='cross-site')return json(403,{error:'نشانی درخواست معتبر نیست.'});
  if(req.method==='GET'&&req.url==='/')return send(200,'text/html; charset=utf-8',page(token,selectionCommand,receiptReview));
  if(req.method==='GET'&&req.url==='/history'){
   try{return json(200,runner.history());}catch{return json(503,{error:'رسید معتبر نیست؛ وضعیت موجود حفظ شد.'});}
  }
  if(req.method!=='POST'||req.url!=='/run')return json(404,{error:'مسیر پیدا نشد.'});
  const key=Buffer.from(typeof req.headers['x-mana-token']==='string'?req.headers['x-mana-token']:'');
  if(req.headers.origin!=='http://'+host||key.length!==64||!timingSafeEqual(key,Buffer.from(token)))return json(403,{error:'درخواست اجرا معتبر نیست.'});
  if(req.headers['content-type']!=='application/json'||req.headers['transfer-encoding']||!/^\d{1,4}$/.test(req.headers['content-length']??''))return json(400,{error:'ورودی استاندارد لازم است.'});
  if(Number(req.headers['content-length'])>2000)return json(413,{error:'دستور بیش از حد طولانی است.'});
  let body;
  try{
   const chunks=[];let size=0;
   for await(const c of req){size+=c.length;if(size>2000)throw Error('BODY_LIMIT');chunks.push(c);}
   const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
   body=JSON.parse(raw);
   if(!body||Array.isArray(body)||Object.keys(body).length!==1||typeof body.instruction!=='string'||raw!==JSON.stringify(body))throw Error('BODY_SCHEMA');
  }catch{return json(400,{error:'فقط متن دستور پذیرفته می‌شود.'});}
  try{return json(200,await runner.run(body.instruction));}
  catch{return json(503,{error:'اجرا قابل تأیید نیست؛ وضعیت برای بازبینی حفظ شد.'});}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;
 return server.listen(port,'127.0.0.1');
}
if(require.main===module){
 const [workspace,masterPath,capturePath,...extra]=process.argv.slice(2);
 const abs=p=>typeof p==='string'&&path.isAbsolute(p)&&path.resolve(p)===p;
 if(extra.length||![workspace,masterPath,capturePath].every(abs)||[masterPath,capturePath].some(p=>p===workspace||p.startsWith(workspace+path.sep)))throw Error('Usage: aec-instruction-preview.cjs /private/state /private/master.txt /private/indot-capture.json');
 const {readCapturedPanelEvidence}=require('./aec-source.cjs');
 const {learnAec,readAecLearning}=require('./aec-learner.cjs');
 const capturePin='2d78ddee786ffcba28391e053ce2ef923ad70bb6de4d0a58d136e45a0f002b33';
 const queuePath=path.resolve(__dirname,'../capability-registry/development-queue-v01.json');
 const port=Number(process.env.MANA_AEC_RESEARCH_PORT??0);
 const runner=createAecInstructionRunner({workspace,masterBytes:readBound(masterPath,128*1024),queueBytes:readBound(queuePath,128*1024),sourceMode:'pinned-replay',discover:()=>readCapturedPanelEvidence(capturePath,capturePin),learn:learnAec,readLearning:readAecLearning});
 const server=start({port,runner});
 server.once('listening',()=>console.log('MANA AEC CPU staging: http://127.0.0.1:'+server.address().port));
 server.once('error',e=>{console.error('MANA_AEC_LISTEN_FAILED',e.code??'UNKNOWN');process.exitCode=1;});
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>server.close());
}
module.exports={start};
