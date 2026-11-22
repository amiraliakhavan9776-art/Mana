'use strict';
// A read-only loopback view over the original bounded campaign; never a new scheduler.
const fs=require('node:fs'),http=require('node:http');
const {createHash,timingSafeEqual}=require('node:crypto');
const {payloadDigest}=require('../src/approval-store.cjs');
const NIGHTLY_SHA256='3f396f9c7abaadd2d958c32bb91d71f5c0ee6e6a2101c85f2ebd5e94a4820101';
const NATIVE_SHA256='f7a935c33eb8c8ae2c1f7e4a0391353768f84f6fc9e9b41895bbed44d89e531b';
const MISSIONS=['net-finish-length-mm','uniform-layer-volume-mm3'];
const SAFE=Object.freeze({modelCalls:0,activationAuthorized:false,productionAllowed:false,modelTrainingPerformed:false});
const HEX=/^[0-9a-f]{64}$/u;
const sha=b=>createHash('sha256').update(b).digest('hex');
const allSafe=o=>o&&Object.entries(SAFE).every(([k,v])=>o[k]===v);
const nativeId=require.resolve('../src/pilot/mana-native-rd.cjs');
const nightlyId=require.resolve('../run-rd-nightly-tick.cjs');
const fail=()=>{throw Error('MANA_IDEAS_EVIDENCE_UNVERIFIED');};

function readCampaignEvidence({campaign,workspace,masterPath}={}){
 if(Number(process.versions.node.split('.')[0])<24||sha(fs.readFileSync(nightlyId))!==NIGHTLY_SHA256||
  sha(fs.readFileSync(nativeId))!==NATIVE_SHA256)fail();
 const {createNightly}=require(nightlyId);
 const {createNativeRd}=require(nativeId);
 let snapshot=null, reads=0;
 const original=createNightly({campaign,workspace,masterPath,nativeFactory:cfg=>{
  // Expose only the independently verifying native read path, not the runner.
  const {inspect}=createNativeRd(cfg);
  return {inspect(){
   if(++reads!==1)fail();
   return (snapshot=inspect());
  }};
 }});
 const journal=original.inspect();
 if(!allSafe(journal)||journal.status!=='COMPLETE_REVIEW_ONLY'||journal.attempts!==2||
    journal.maxAttempts!==2||journal.verifiedCases!==2||reads!==1||
    !allSafe(snapshot)||snapshot.status!=='COMPLETE'||!Array.isArray(snapshot.outcomes)||snapshot.outcomes.length!==2)
  fail();
 const outcomes=snapshot.outcomes.map((o,i)=>{
  const s=o?.score;
  if(o?.mission!==MISSIONS[i]||o.status!=='AWAITING_HUMAN_REVIEW'||!HEX.test(o.digest??'')||
     s?.testsRun!==24||!Array.isArray(s.insensitive)||s.insensitive.length!==0||
     s.regression?.passed!==8||s.regression.total!==8||s.fresh?.passed!==16||s.fresh.total!==16||
     !HEX.test(s.regressionSha256??'')||s.unit!==(i===0?'mm':'mm3'))fail();
  return {mission:o.mission,reviewDigest:o.digest,regressionPassed:8,freshPassed:16};
 });
 if(outcomes[0].reviewDigest===outcomes[1].reviewDigest)fail();
 // The original journal compared these same readback digests to its sealed records.
 // This is a content identifier for the pair and policy, not a signed receipt.
 return payloadDigest({schema:'MANA_NIGHTLY_IDEA_SOURCE_V1',nightlyImplementation:NIGHTLY_SHA256,
  verifiedCases:journal.verifiedCases,maxAttempts:journal.maxAttempts,outcomes});
}

const CSS=':root{color-scheme:light dark;font:16px/1.85 system-ui,sans-serif}body{margin:0;padding:1.25rem;background:Canvas;color:CanvasText}main{max-width:46rem;margin:2rem auto}article{padding:1.4rem;border:1px solid GrayText;border-radius:1rem}h1,h2{line-height:1.45}code{overflow-wrap:anywhere;font-size:.88rem}dt{font-weight:700}dd{margin-inline-start:0;margin-bottom:.8rem}.tag{font-weight:700}';
const CSP="default-src 'none'; style-src 'sha256-"+createHash('sha256').update(CSS).digest('base64')+"'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const escape=x=>x.replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(section){
 return '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>مانا | ایدهٔ آزمایشی</title><style>'+CSS+'</style><main><h1>ایدهٔ آزمایشی مانا</h1><p class="tag">فقط برای بازبینی انسانی</p>'+section+'</main></html>';
}
const blocked=()=>page('<article><h2>مدرک کامل تأیید نشد</h2><p>برای نمایش ایده، رسیدِ هر دو آزمونِ اجرای قبلی باید در همان پوشهٔ اصلی معتبر باشد. این صفحه چیزی را شروع، تکرار، تغییر یا فعال نمی‌کند.</p></article>');
function renderIdea(evidenceId){
 const {proposeEvidenceImprovementIdeas}=require('../src/native/evidence-improvement-ideas.cjs');
 const observation={evidenceId,family:'campaign-coverage',outcome:'VERIFIED_COMPLETE_NO_FRESH_CASE',
  assessment:'CONFIRMED_OPPORTUNITY',sampleCount:1,affectedCount:1};
 const result=proposeEvidenceImprovementIdeas({trustedEvidence:{schema:'MANA_REVIEWED_EVIDENCE_SNAPSHOT_V1',observations:[observation]},priorIdeaIds:[]});
 if(result?.status!=='IDEAS_PENDING_REVIEW'||!Array.isArray(result.ideas)||result.ideas.length!==1||
    result.method!=='DETERMINISTIC_RULES_FROM_HOST_VERIFIED_EVIDENCE_ONLY'||result.actionsExecuted!==0||
    result.modelCalls!==0||result.modelTrainingPerformed!==false||result.activationAuthorized!==false||
    result.productionDeploymentAllowed!==false)fail();
 const [idea]=result.ideas;
 const bounded=x=>typeof x==='string'&&x.length>=1&&x.length<=1600;
 const next=idea.leastNextAcceptanceTest;
 if(idea.family!=='campaign-coverage'||idea.topic!=='add-one-reviewed-unseen-benign-case'||idea.reviewRequired!==true||
    idea.evidence?.id!==evidenceId||next?.id!=='one-independent-unseen-case-and-restart'||next.mode!=='OFFLINE_SYNTHETIC_ONLY'||
    ![idea.title,idea.reason,next.description].every(bounded))fail();
 return page('<article><h2>'+escape(idea.title)+'</h2><dl><dt>چرا این ایده؟</dt><dd>'+escape(idea.reason)+
  '</dd><dt>آزمون بعدی پیشنهادی</dt><dd>'+escape(next.description)+
  '</dd><dt>بخش پیشنهادی سند مادر و دلیل انتخاب</dt><dd>بخش ۶٫۶، «قرارداد مشترک اعداد، واحدها و نسخه‌ها»: نمونهٔ پیشنهادی باید واحد ورودی را صریح کنترل کند و همان نتیجه و مدرک را پس از راه‌اندازی مجدد بازنشان دهد. نگاشت مورد تازه به این بخش هنوز نیازمند بازبینی است و این مورد ردیف ثبت‌شدهٔ صف نیست.'+
  '</dd><dt>مبنای مقایسه با آخرین نسخهٔ پذیرفته‌شده</dt><dd>هنوز مقایسه یا بهبود تازه‌ای اندازه‌گیری نشده است. قبل از پذیرش هر تغییر، همان مجموعهٔ آزمون‌های از پیش ثبت‌شده باید روی آخرین خط مبنای پذیرفته‌شده و نسخهٔ پیشنهادی اجرا و تفاوت نتیجه ثبت شود؛ رسیدهای زیر در انتظار بازبینی‌اند و خط مبنای پذیرفته‌شده محسوب نمی‌شوند.'+
  '</dd><dt>شناسهٔ مدرک اجراهای پیشین</dt><dd><code dir="ltr">'+escape(evidenceId)+
  '</code></dd></dl><p>دو نتیجهٔ قبلی به‌طور مستقل بازسنجی شدند: هر مورد ۸ از ۸ آزمون بازگشتی و ۱۶ از ۱۶ آزمون مستقلِ آن کارزار.</p><ul><li>بخش ۶٫۴، متره و برآورد جامع: طول خالص نازک‌کاری خطی در یک نمونهٔ ساختگی.</li><li>بخش ۶٫۶، قرارداد مشترک اعداد، واحدها و نسخه‌ها: حجم لایهٔ یکنواخت با میلی‌متر و میلی‌متر مکعبِ صریح.</li></ul><p>پیشنهاد تازه هنوز اجرا یا تأیید نشده و به صف اضافه نشده است.</p></article>');
}

function startIdeasPreview({campaign,workspace,masterPath,token,port=0}={}){
 if(typeof token!=='string'||!HEX.test(token)||!Number.isInteger(port)||port<0||port>65535)
  throw Error('MANA_IDEAS_PREVIEW_INVALID_CONFIGURATION');
 const auth=Buffer.from('Basic '+Buffer.from('mana:'+token,'utf8').toString('base64'),'ascii');
 const read=()=>readCampaignEvidence({campaign,workspace,masterPath});
 const server=http.createServer({requestTimeout:5000,headersTimeout:5000,keepAliveTimeout:1000,maxHeaderSize:4096},(req,res)=>{
  const send=(status,body,contentType='text/plain; charset=utf-8',extra={})=>{
   res.writeHead(status,{'Content-Type':contentType,'Cache-Control':'no-store','Content-Security-Policy':CSP,
    'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',...extra});
   res.end(body);
  };
  const host='127.0.0.1:'+server.address()?.port;
  if(req.socket.remoteAddress!=='127.0.0.1'||req.headers.host!==host||
     (req.headers.origin!==undefined&&req.headers.origin!=='http://'+host)||
     (req.headers['sec-fetch-site']!==undefined&&!['none','same-origin'].includes(req.headers['sec-fetch-site'])))
   return send(403,'درخواست نامعتبر است.');
  if(req.url!=='/')return send(404,'صفحه پیدا نشد.');
  if(req.method!=='GET')return send(405,'فقط خواندن مجاز است.','text/plain; charset=utf-8',{Allow:'GET'});
  const given=Buffer.from(req.headers.authorization??'','utf8');
  if(given.length!==auth.length||!timingSafeEqual(given,auth))
   return send(401,'برای دیدن این پنل احراز هویت لازم است.','text/plain; charset=utf-8',
    {'WWW-Authenticate':'Basic realm="MANA Ideas", charset="UTF-8"'});
  try{return send(200,renderIdea(read()),'text/html; charset=utf-8');}
  catch{return send(503,blocked(),'text/html; charset=utf-8');}
 });
 server.maxHeadersCount=24;
 server.maxConnections=8;
 server.maxRequestsPerSocket=10;
 server.listen(port,'127.0.0.1');
 return server;
}
if(require.main===module){
 try{
  const [campaign,workspace,masterPath,port='0',...extra]=process.argv.slice(2);
  if(extra.length||![campaign,workspace,masterPath].every(x=>typeof x==='string'&&x.startsWith('/'))||
     !/^(?:0|[1-9][0-9]{0,4})$/u.test(port))throw Error();
  const token=process.env.MANA_IDEAS_PREVIEW_TOKEN;
  const server=startIdeasPreview({campaign,workspace,masterPath,port:Number(port),token});
  server.once('listening',()=>console.log('MANA ideas: http://127.0.0.1:'+server.address().port));
  server.once('error',()=>{console.error('MANA_IDEAS_PREVIEW_LISTEN_FAILED');process.exitCode=1;});
  for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>server.close());
 }catch{
  console.error('MANA_IDEAS_PREVIEW_CONFIGURATION_INVALID');
  process.exitCode=1;
 }
}
module.exports={startIdeasPreview,readCampaignEvidence};
