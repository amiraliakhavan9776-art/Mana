'use strict';
function client(){
 const $=id=>document.getElementById(id), log=$('thread'), form=$('message-form'), input=$('text'), status=$('status'), confirm=$('confirm'), reset=$('reset');
 let pending=false,approval=null,skillApproval=false,expired=false;
 function row(role,text,details,expand){
  const el=document.createElement('article');el.className=role==='شما'?'turn human':'turn assistant';
  const who=document.createElement('strong');who.textContent=role;
  const body=document.createElement('p');body.textContent=text;el.append(who,body);
  if(typeof details==='string'&&details){const d=document.createElement('details'),h=document.createElement('summary'),p=document.createElement('pre');h.textContent='جزئیات نتیجه';p.textContent=details;d.open=Boolean(expand);d.append(h,p);el.append(d);}
  log.append(el);if(log.children.length>30)log.firstElementChild.remove();
 }
 function buttons(){
  $('send').disabled=pending||expired;input.disabled=pending||expired;reset.disabled=pending||expired;
  confirm.textContent=skillApproval?'تأیید و آزمایش مهارت':'تأیید و اجرای آزمون';confirm.hidden=!approval;confirm.disabled=pending||!approval||expired;
 }
 async function send(action,payload){
  if(pending||expired)return;
  pending=true;approval=null;skillApproval=false;buttons();status.textContent='در حال دریافت نتیجه…';const abort=new AbortController(), deadline=setTimeout(()=>abort.abort(),60000);
  try{
   const r=await fetch('/mana/turn',{method:'POST',signal:abort.signal,headers:{'Content-Type':'application/json','X-Mana-Token':CONFIG.token},body:JSON.stringify({action,session:CONFIG.session,...payload})});
   const data=await r.json();
   if(!data||typeof(data.message??data.error)!=='string')throw Error('invalid reply');
   if((r.status===404||r.status===410)||['SESSION_EXPIRED','EXPIRED'].includes(data.status))expired=true;
   if(action==='reset'&&data.status==='RESET')log.replaceChildren();
   if(r.ok&&data.status==='CONFIRM_REQUIRED'&&typeof data.confirmation==='string'&&/^[a-f0-9]{32}$/.test(data.confirmation)){approval=data.confirmation;skillApproval=data.kind==='skill';}
   const history=Array.isArray(data.history)?data.history.slice(0,8).filter(x=>typeof x?.title==='string'&&typeof x?.status==='string').map(x=>x.title+' · '+x.status).join('\n'):'';
   row('مانا',data.message??data.error,data.details??history,(['skill','clearance','skirting'].includes(data.kind))||Boolean(history)||(action==='message'&&/^گفت[\u200c ]?وگو\s*:/u.test(payload?.text||'')));
   status.textContent=expired?'نشست پایان یافته؛ صفحه را تازه کنید.':'';
  }catch(e){row('مانا',action==='confirm'?'پاسخ اجرا دریافت نشد. اجرا دوباره فرستاده نشد؛ ابتدا سابقهٔ آزمون یا رسید مهارت را بررسی کنید.':'پاسخ دریافت نشد؛ اتصال آزمایشی را بررسی کنید.');status.textContent='ارتباط کامل نشد.';}
  finally{clearTimeout(deadline);pending=false;buttons();if(approval)confirm.focus();}
 }
 form.addEventListener('submit',e=>{e.preventDefault();const text=input.value.trim();if(!text||pending||expired)return;row('شما',text);input.value='';send('message',{text});});
 confirm.onclick=()=>{if(!approval||pending)return;const confirmation=approval;row('شما',skillApproval?'آزمایش یک پیشنهاد مهارت را تأیید می‌کنم.':'اجرای آزمون در محیط آزمایشی را تأیید می‌کنم.');send('confirm',{confirmation});};
 reset.onclick=()=>send('reset',{});
 for(const b of document.querySelectorAll('[data-example]'))b.onclick=()=>{if(!pending&&!expired){input.value=b.dataset.example;input.focus();}};
 buttons();
}
function manaPage(token,session,{textModelEnabled=false,skillPilotEnabled=false,skillDependenceEnabled=false,clearancePreviewEnabled=false}={}){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||typeof session!=='string'||!/^[a-f0-9]{32}$/.test(session))throw Error('Invalid conversation page configuration');
 return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گفت‌وگو با مانا</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
 :root{color-scheme:light;--ink:#203630;--green:#24594a;--line:#d9e3da;--paper:#f5f6f0}
 *,*::before,*::after{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.75 system-ui,sans-serif}main{max-width:720px;margin:0 auto;padding:clamp(14px,4vw,28px)}
 header{padding:20px;background:#254d42;color:white;border-radius:18px}header p{margin:4px 0}h1{margin:4px 0;font-size:clamp(1.5rem,7vw,2.3rem)}header a{color:#edeee2}.tag{color:#f0d4a0;font-size:.88rem;font-weight:700}
 .examples,.actions{display:flex;gap:8px;flex-wrap:wrap;margin:.65rem 0}button{appearance:none;font:inherit;font-weight:650;cursor:pointer;background:var(--green);color:white;border:1px solid var(--green);border-radius:10px;padding:7px 12px}button[hidden]{display:none}button:disabled{opacity:.58;cursor:default}button.secondary{background:white;color:var(--green);border-color:var(--line)}
 #thread{margin:1.1rem 0;min-width:0}.turn{padding:12px 16px;border-radius:14px;margin:10px 0;overflow-wrap:anywhere}.turn p{margin:4px 0;white-space:pre-wrap}.assistant{background:white;border:1px solid var(--line)}.human{background:#e6efe6;margin-inline-start:8%}.turn strong{font-size:.82rem;color:#386654}
 form{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px}label{font-weight:700;display:block;margin-bottom:4px}textarea{resize:vertical;width:100%;min-height:88px;border:1px solid #8eaba0;border-radius:9px;background:white;font:inherit;padding:9px;color:inherit}
 :focus-visible{outline:3px solid #aa7850;outline-offset:2px}pre{margin:.45rem 0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}summary{cursor:pointer}#status{min-height:1.7em;margin:.3rem 0}.note{font-size:.88rem;color:#446458}
 </style></head><body><main><header><a href="/">برگشت به مانا</a><p class="tag">آزمایشی · اجرای کنترل‌شده</p><h1>گفت‌وگو با مانا</h1><p>درخواستت را بنویس. کارهای پشتیبانی‌شده در همین صفحه نتیجه می‌دهند.</p></header>
 <div class="examples" aria-label="نمونه درخواست‌ها"><button type="button" class="secondary" data-example="مساحت خالص کف مستطیل، طول ۵ متر، عرض ۴ متر، مساحت کسرشده ۳ مترمربع">نمونهٔ مترهٔ کف</button><button type="button" class="secondary" data-example="برو جلو">آزمون هسته</button><button type="button" class="secondary" data-example="قرنیز: طول ۵ متر، عرض ۴ متر، کسر ۰٫۹ متر">مترهٔ قرنیز</button>${clearancePreviewEnabled?'<button type="button" class="secondary" data-example="بیشتر: ۱۲۰۰ و ۷۵۰ میلی‌متر">مقایسهٔ آزمایشی دو مقدار</button>':''}${skillDependenceEnabled?'<button type="button" class="secondary" data-example="آزمایش وابستگی مهارت متره">آزمایش وابستگی مهارت متره</button><button type="button" class="secondary" data-example="رسید وابستگی مهارت متره">رسید وابستگی مهارت متره</button>':''}${skillPilotEnabled?'<button type="button" class="secondary" data-example="آزمایش مهارت متره">آزمایش مهارت متره</button><button type="button" class="secondary" data-example="رسید مهارت متره">رسید مهارت متره</button>':''}${textModelEnabled?'<button type="button" class="secondary" data-example="گفت‌وگو: چه کارهایی می‌توانی انجام بدهی؟">گفت‌وگوی متنی</button>':''}</div>
 <section id="thread" role="log" aria-label="گفت‌وگو" aria-live="polite"><article class="turn assistant"><strong>مانا</strong><p>می‌توانی مترهٔ کف مستطیلی بخواهی یا بگویی «برو جلو» تا آزمون هسته را آماده کنم. تغییر نسخهٔ اصلی و اجرای درخواست خارج از این دامنه پشتیبانی نمی‌شود.</p></article></section>
 <form id="message-form"><label for="text">پیام به مانا</label><textarea id="text" required maxlength="500" rows="3" placeholder="درخواستت را فارسی بنویس"></textarea><div class="actions"><button id="send" type="submit">ارسال</button><button id="confirm" type="button" hidden>تأیید و اجرای آزمون</button><button id="reset" type="button" class="secondary">پاک‌کردن این گفتگو</button></div></form>
 <p id="status" role="status"></p><p class="note">متن این صفحه برای کار آزمایشی است؛ دادهٔ شخصی یا محرمانه وارد نکن. دفترچه، پلان و جارویس از صفحهٔ اصلی در دسترس‌اند اگر پایلوت مربوط فعال باشد.</p>
 </main><script>const CONFIG=${JSON.stringify({token,session})};(${client.toString()})();</script></body></html>`;
}
module.exports={manaPage};
