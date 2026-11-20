'use strict';
const {randomBytes}=require('node:crypto');
const {takeoffFromPersian}=require('../../floor-takeoff-fa.cjs');
const {COMMAND:skillCommand}=require('./mana-skill-pilot.cjs');
const {COMMAND:dependenceCommand,RECEIPT_COMMAND:dependenceReceipt}=require('./mana-skill-dependence.cjs');
const labels={BENCHMARK_PASSED:'آزمون قبول شد',REVIEW_REQUIRED:'نیازمند بازبینی',EXECUTION_BLOCKED:'اجرای آزمون متوقف شد',SUPPORTED_BENCHMARKS_COMPLETE:'آزمون‌های متصل به این نسخه کامل شده‌اند؛ نه همهٔ قابلیت‌های سند.'};
const status=(name,message,extra={})=>({status:name,message,...extra});
const token=()=>randomBytes(16).toString('hex');
const hex=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
const clean=s=>s.replace(/\s+/gu,' ').trim();
const invalid=()=>status('BLOCKED','ساختار درخواست معتبر نیست.');
const slots={length_m:'طول',width_m:'عرض',excluded_area_m2:'(?:مساحت|سطح) کسر[‌ ]*شده'};
const marker=(s,k)=>new RegExp('(?:^|[ ،,؛;])'+slots[k]+'(?=$|[ :=۰-۹٠-٩0-9])','u').test(s);

function createManaConversation({runner,withRunLock,answerText,skillPilot,skillDependencePilot,now=Date.now}={}){
 if(!runner||typeof runner.history!=='function'||typeof withRunLock!=='function'||typeof now!=='function'||answerText!==undefined&&typeof answerText!=='function')throw Error('Invalid conversation configuration');
 if([skillPilot,skillDependencePilot].some(p=>p!==undefined&&(!p||typeof p.inspect!=='function'||typeof p.run!=='function')))throw Error('Invalid skill pilot configuration');
 const sessions=new Map(),ttl=20*60*1000,confirmTtl=90*1000;
 let modelBusy=false;
 const fresh=()=>({expires:now()+ttl,pending:null,floor:null,textHistory:[],working:false});
 function createSession(){
  for(const [id,s] of sessions)if(s.expires<=now()&&!s.working)sessions.delete(id);
  if(sessions.size>=32){const oldest=[...sessions].find(([,s])=>!s.working);if(!oldest)return null;sessions.delete(oldest[0]);}
  const id=token();sessions.set(id,fresh());return id;
 }
 function skillResult(r,dependence=false){
  const messages={PRIOR_EVIDENCE_BLOCKED:'رسید شکست مرحلهٔ قبلی با شواهد مورد انتظار تطبیق ندارد؛ مدل فراخوانی نشد.',DEPENDENCE_REJECTED:'پیشنهاد در بررسی اثر مستقل هر ورودی رد شد؛ آزمون عددی اصلی اجرا نشد.',READY:'هنوز پیش‌نویسی درخواست نشده است.',INVALID_PROPOSAL:'پیشنهاد مدل شکل معتبر نداشت؛ آزمون عددی اجرا نشد.',BENCHMARK_FAILED:'پیشنهاد همهٔ آزمون‌ها را قبول نشد.',PROVIDER_UNAVAILABLE:'پاسخ قابل‌اعتبار مدل دریافت نشد؛ درخواست ممکن است رسیده باشد و تکرار نمی‌شود.',UNKNOWN_OUTCOME:'رسید کامل و قابل‌اعتبار نیست؛ اجرای مجدد مسدود است.',PASSED_AWAITING_REVIEW:'پیشنهاد در این نمونه آزمون‌ها را گذراند؛ در انتظار بازبینی انسانی است.'};
  const counts=Number.isInteger(r.total)&&Number.isInteger(r.passed)&&Number.isInteger(r.testsRun)?'قبول‌شده: '+r.passed+' از '+r.total+'؛ اجراشده: '+r.testsRun+'. ':'';
  const candidate=r.expression&&typeof r.candidateSha256==='string'?'\nپیشنهادِ بررسی‌شده: '+JSON.stringify(r.expression)+'\nشناسهٔ پیشنهاد: '+r.candidateSha256:'';
  const details=counts+(r.reused?'این رسید قبلاً ثبت شده؛ مدل دوباره صدا زده نشد. ':'')+'فقط جمع دو طول نمونه، با دقت یک میلی‌متر. هیچ مهارتی فعال نشد و مدل آموزش ندید.'+(dependence?' مقایسهٔ محدودِ اثر تغییر جداگانهٔ هر ورودی، اثبات کلی نیست.':'')+candidate;
  return status(r.status==='PASSED_AWAITING_REVIEW'?'COMPLETED':r.status==='READY'?'READY':'BLOCKED',messages[r.status]||messages.UNKNOWN_OUTCOME,{details,kind:'skill'});
 }
 function history(){
  try{const rows=runner.history().slice(0,8).map(r=>({title:String(r.title).slice(0,200),status:labels[r.status]||'وضعیت نیازمند بررسی'}));return status('COMPLETED',rows.length?'آخرین رسیدهای ثبت‌شده:':'هنوز رسیدی ثبت نشده است.',{history:rows});}catch{return status('BLOCKED','خواندن سابقه ممکن نشد؛ وضعیت موجود تغییر نکرد.');}
 }
 async function turn(body){
  if(!body||Array.isArray(body)||typeof body!=='object'||!hex(body.session))return invalid();
  const {session,action}=body,keys=Object.keys(body).sort().join(',');
  if(action==='message'?keys!=='action,session,text'||typeof body.text!=='string'||!body.text.trim()||body.text.length>500||/[\x00-\x08\x0b\x0c\x0e-\x1f\u202a-\u202e\u2066-\u2069]/u.test(body.text):action==='confirm'?keys!=='action,confirmation,session'||!hex(body.confirmation):action==='reset'?keys!=='action,session':true)return invalid();
  const s=sessions.get(session);
  if(!s||s.expires<=now())return status('EXPIRED','نشست منقضی شد؛ صفحه را دوباره باز کن.');
  if(s.working)return status('BUSY','یک درخواست در همین نشست در حال اجراست.');
  s.expires=now()+ttl;
  if(action==='reset'){sessions.set(session,fresh());return status('RESET','گفت‌وگوی موقت پاک شد؛ رسیدهای آزمون دست‌نخورده‌اند.');}
  if(action==='confirm'){
   if(!s.pending||s.pending.expires<=now()||s.pending.token!==body.confirmation)return status('BLOCKED','این تأیید معتبر نیست یا منقضی شده. درخواست اصلی را دوباره بفرست.');
   const pending=s.pending;s.pending=null;s.floor=null;s.working=true;
   if(pending.kind==='skill'||pending.kind==='dependence'){
    const dependence=pending.kind==='dependence',pilot=dependence?skillDependencePilot:skillPilot;
    if(modelBusy){s.working=false;return status('BUSY','مدل مشغول است؛ این تأیید مصرف شد و درخواست خودکار تکرار نمی‌شود.');}
    modelBusy=true;
    try{return skillResult(await pilot.run(),dependence);}
    catch{return skillResult({status:'UNKNOWN_OUTCOME'},dependence);}
    finally{modelBusy=false;s.working=false;}
   }
   try{
    const r=await withRunLock();
    if(r.kind==='busy')return status('BUSY','یک مأموریت در حال اجراست. این تأیید مصرف شد؛ پس از پایان دوباره «برو جلو» بفرست.');
    if(r.kind!=='result')return status('BLOCKED','نتیجه قطعی به دست نیامد. سابقه و وضعیت را بررسی کن؛ تکرار خودکار انجام نمی‌شود.');
    const value=r.value,message=labels[value?.status]||'وضعیت آزمون مشخص نشد.';
    const details=[value?.mission?.title,value?.selectedBecause,value?.reason,value?.reused?'رسید قبلی خوانده شد؛ آزمون تکرار نشد.':''].filter(x=>typeof x==='string'&&x).join('\n').slice(0,3000);
    return status(['BENCHMARK_PASSED','SUPPORTED_BENCHMARKS_COMPLETE'].includes(value?.status)?'COMPLETED':'BLOCKED',message,{details});
   }finally{s.working=false;}
  }
  const text=clean(body.text);s.pending=null;
  if(text===dependenceCommand||text===dependenceReceipt){
   s.floor=null;
   if(!skillDependencePilot)return status('BLOCKED','آزمایش وابستگی مهارت در این محیط فعال نیست.');
   const r=skillDependencePilot.inspect();
   if(text!==dependenceCommand||r.status!=='READY')return skillResult(r,true);
   s.pending={kind:'dependence',token:token(),expires:now()+confirmTtl};
   return status('CONFIRM_REQUIRED','شکست قبلی ۱ از ۱۰ را از رسید بازبینی کردم. با تأیید تو، یک پیشنهاد تازه از مدل محلی می‌گیرم؛ فقط توضیح اینکه هر دو ورودی باید بر نتیجه اثر داشته باشند ارسال می‌شود، نه پاسخ، عبارت قبلی یا دادهٔ آزمون. اول اثر مستقل هر ورودی و بعد، در صورت قبولی، ۱۰ آزمون عددی بررسی می‌شود. مسیر قبلی و مهارت فعال دست‌نخورده می‌مانند.',{confirmation:s.pending.token,kind:'skill'});
  }
  if(text===skillCommand||text==='رسید مهارت متره'){
   s.floor=null;
   if(!skillPilot)return status('BLOCKED','آزمایش مهارت متره در این محیط فعال نیست.');
   const r=skillPilot.inspect();
   if(text!==skillCommand||r.status!=='READY')return skillResult(r);
   s.pending={kind:'skill',token:token(),expires:now()+confirmTtl};
   return status('CONFIRM_REQUIRED','با تأیید تو فقط یک درخواست به مدل محلی فرستاده می‌شود: پیشنهاد عبارت محاسباتی برای جمع دو طول نمونه، به متر با دقت میلی‌متر. هستهٔ مانا آن را با ۱۰ آزمون مستقل بررسی می‌کند؛ نمونه‌ها به مدل فرستاده نمی‌شوند. بدون اجرای کد پیشنهادی، تغییر فایل‌های مانا، یا فعال‌سازی مهارت.',{confirmation:s.pending.token,kind:'skill'});
  }
  if(text==='برو جلو'){
   s.floor=null;s.pending={token:token(),expires:now()+confirmTtl};
   return status('CONFIRM_REQUIRED','با تأیید تو، مانا حداکثر یک مأموریت آماده از صف متصل به سند را بررسی می‌کند. انتخاب دقیق هنگام اجرا و بر اساس رسیدهای همان نسخه انجام می‌شود. فقط آزمون‌های ازپیش‌تعریف‌شده در محیط ایزوله؛ بدون انتشار یا تغییر سرور.',{confirmation:s.pending.token});
  }
  if(['سابقه','سابقه آزمون‌ها','سابقهٔ آزمون‌ها'].includes(text)){s.floor=null;return history();}
  if(/^گفت[‌ ]?وگو\s*:/u.test(text)){
   s.floor=null;const question=text.replace(/^گفت[‌ ]?وگو\s*:\s*/u,'');
   if(!question)return status('CLARIFY','برای گفت‌وگوی متنی، بعد از «گفت‌وگو:» سؤال بنویس.');
   if(!answerText)return status('BLOCKED','مدل گفت‌وگوی متنی در این محیط فعال نیست. مسیرهای بومی به مدل نیاز ندارند.');
   if(modelBusy)return status('BUSY','مدل محلی مشغول پاسخ دیگری است. پاسخی خودکار دوباره درخواست نمی‌شود.');
   modelBusy=true;s.working=true;
   try{const r=await answerText({text:question,history:s.textHistory.map(x=>({...x}))});if(r?.status!=='TEXT_ANSWER'||typeof r.text!=='string'||!r.text.trim()||r.text.length>2000)return status('BLOCKED','پاسخ متنی قابل‌استفاده دریافت نشد. هیچ اقدامی انجام نشد.');
    s.textHistory=[...s.textHistory,{role:'user',text:question},{role:'assistant',text:r.text}].slice(-4);
    while(s.textHistory.reduce((n,x)=>n+Buffer.byteLength(x.text),0)>10000)s.textHistory.splice(0,2);
    return status('COMPLETED','پاسخ متنی مدل محلی؛ هیچ اقدامی انجام نشد.',{details:r.text});
   }catch{return status('BLOCKED','مدل محلی پاسخ نداد. هیچ اقدامی انجام نشد.');}finally{s.working=false;modelBusy=false;}
  }
  if(['سلام','راهنما','کمک'].includes(text)){s.floor=null;return status('READY','«برو جلو» برای پیش‌نمایش اجرای آزمایشی، «سابقه» برای رسیدها، یا درخواست مترهٔ کف با طول، عرض و کسرِ دارای واحد بفرست.');}
  let source=text;
  if(s.floor&&text.length<90&&marker(text,s.floor.field)&&Object.keys(slots).filter(k=>marker(text,k)).length===1)source=s.floor.source+'، '+text;
  s.floor=null;
  if(!/(?:^|[ ،,؛;])(?:مساحت (?:خالص )?کف|کف مستطیل|طول|عرض|مساحت کسر[‌ ]*شده)(?=$|[ :=،,؛;۰-۹٠-٩0-9])/u.test(source))return status('UNSUPPORTED','این درخواست به مسیر اجرایی وصل نیست. «راهنما» را بفرست؛ هیچ اقدامی انجام نشد.');
  const r=takeoffFromPersian(source);
  if(r.status==='FLOOR_TAKEOFF_CALCULATED')return status('COMPLETED',r.message,{details:'محاسبهٔ قطعی هستهٔ بومی، بدون مدل. دامنه: کف مستطیلی، بدون قیمت‌گذاری.'});
  if(r.status==='NEEDS_INPUT'&&r.fields.length===1&&!marker(source,r.fields[0])&&source.length<390&&!/(?:حساب کن|محاسبه کن)[؟.!]?$/u.test(source)){
   s.floor={source,field:r.fields[0]};return status('CLARIFY',r.message.replace('؛ لطفاً درخواست کامل رو بفرست.','؛ می‌توانی همین یک مقدار را با نام و واحد بفرستی.'));
  }
  return status(r.status==='UNSUPPORTED_TEXT'?'UNSUPPORTED':'CLARIFY',r.message);
 }
 return {createSession,turn};
}
module.exports={createManaConversation};
