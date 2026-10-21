'use strict';
const html=`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#101827"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="مانا AI"><link rel="manifest" href="/manifest.webmanifest"><title>مانا AI | موبایل</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0d1422;color:#f5f7fb;font:16px system-ui,-apple-system,sans-serif}main{max-width:700px;margin:auto;min-height:100dvh;display:flex;flex-direction:column;padding:env(safe-area-inset-top) 16px env(safe-area-inset-bottom)}header{padding:20px 0 12px;display:flex;justify-content:space-between;align-items:center}h1{font-size:23px;margin:0}.hint{color:#a9b7c9;font-size:12px}.tabs{display:flex;gap:8px;margin:12px 0}.tabs button{flex:1}.tabs button[aria-pressed=true]{background:#4bd6c5;color:#0d1422}button{border:0;border-radius:12px;background:#29384d;color:white;padding:12px 16px;font:inherit;cursor:pointer}button:disabled{opacity:.5}section{flex:1;overflow-y:auto;padding:10px 0 30px}.bubble{white-space:pre-wrap;overflow-wrap:anywhere;padding:13px 15px;border-radius:16px;margin:12px 0;line-height:1.8;background:#1c2a3d}.bubble.user{background:#20564f;margin-right:28px}.bubble.bot{margin-left:28px}.composer{position:sticky;bottom:0;background:#0d1422;padding:10px 0 14px}textarea,input{width:100%;background:#19283a;color:white;border:1px solid #42516a;border-radius:12px;padding:12px;font:inherit}textarea{resize:vertical;min-height:88px}label{display:block;margin:8px 0;font-size:13px;color:#c3d2e5}#orgWrap{display:none}.voice-controls{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}.voice-controls button{font-size:13px;flex:1}.send{width:100%;margin-top:8px;background:#4bd6c5;color:#0d1422;font-weight:700}a{color:#8be9dd}@media(min-width:600px){header{padding-top:35px}}
</style></head><body><main><header><div><h1>مانا AI</h1><div class="hint">نسخه آزمایشی مستقل • اجرای مدل روی سرور خودتان</div></div><span aria-hidden="true">✦</span></header><nav class="tabs" aria-label="حالت گفتگو"><button id="chatTab" aria-pressed="true" type="button">گفتگو</button><button id="planTab" aria-pressed="false" type="button">شناخت کسب‌وکار</button></nav><section id="messages" role="log" aria-live="polite"><div class="bubble bot">سلام! من نسخه آزمایشی مانا هستم. برای پاسخ هوشمند، مدل محلی باید فعال باشد.</div></section><div class="composer"><div id="orgWrap"><label for="org">نام مجموعه</label><input id="org" maxlength="180" placeholder="مثلاً شرکت مانا" autocomplete="organization"></div><label for="prompt">درخواست شما</label><textarea id="prompt" maxlength="4000" placeholder="از مانا چه می‌خواهید؟"></textarea><div class="voice-controls"><button id="mic" type="button" disabled>🎙 گفتار به متن (اختیاری)</button><button id="speak" type="button" disabled>🔊 خواندن پاسخ</button><button id="stopVoice" type="button">توقف صدا</button></div><button class="send" id="send" type="button">ارسال به مانا</button><div class="hint" id="voiceNotice">قابلیت صوتی مرورگر ممکن است صدا را به سرویس سازنده مرورگر ارسال کند. برای اطلاعات محرمانه از آن استفاده نکنید.</div><div class="hint">این نمونه اطلاعات گفتگو را ذخیره نمی‌کند. اطلاعات محرمانه وارد نکنید.</div></div></main><script>
let mode='chat',lastAnswer='',recorder=null,chunks=[],stream=null;const $=id=>document.getElementById(id);
const audioFormat=window.MediaRecorder&&MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':null;
if(audioFormat&&navigator.mediaDevices?.getUserMedia){
 $('mic').disabled=false;
 $('mic').onclick=async()=>{
  if(recorder?.state==='recording'){recorder.stop();return}
  stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];
  recorder=new MediaRecorder(stream,{mimeType:audioFormat});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onstop=async()=>{
   stream.getTracks().forEach(t=>t.stop());
   const audio=new Blob(chunks,{type:audioFormat});
   try{
    if(audio.size>2097152)throw Error('Audio too large');
    const r=await fetch('/api/voice/transcribe',{method:'POST',headers:{'Content-Type':'audio/webm'},body:audio});
    if(!r.ok)throw Error('Local voice engine unavailable');
    const data=await r.json();$('prompt').value=String(data.text||'').slice(0,4000);
   }catch(e){$('voiceNotice').textContent=e.message}
   $('mic').textContent='🎙 ضبط صدا';recorder=null;
  };
  recorder.start();$('mic').textContent='⏹ پایان ضبط';
  setTimeout(()=>{if(recorder?.state==='recording')recorder.stop()},15000);
 };
}
$('speak').disabled=false;
let playback=null;
$('speak').onclick=async()=>{
 if(!lastAnswer)return;
 try{
  const r=await fetch('/api/voice/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:lastAnswer.slice(0,3000)})});
  if(!r.ok)throw Error('Local voice engine unavailable');
  const blob=await r.blob();if(blob.size>4194304)throw Error('Audio too large');
  if(playback)playback.pause();
  playback=new Audio(URL.createObjectURL(blob));
  playback.onended=()=>URL.revokeObjectURL(playback.src);
  await playback.play();
 }catch(e){$('voiceNotice').textContent=e.message}
};
$('stopVoice').onclick=()=>{if(recorder?.state==='recording')recorder.stop();playback?.pause()};
$('voiceNotice').textContent='پردازش صوت از طریق درگاه محلی مانا انجام می‌شود. HTTPS برای استفاده روی گوشی لازم است.';
function select(next){mode=next;$('chatTab').setAttribute('aria-pressed',String(next==='chat'));$('planTab').setAttribute('aria-pressed',String(next==='plan'));$('orgWrap').style.display=next==='plan'?'block':'none'}
$('chatTab').onclick=()=>select('chat');$('planTab').onclick=()=>select('plan');
function bubble(content,kind){const d=document.createElement('div');d.className='bubble '+kind;d.textContent=content;$('messages').appendChild(d);d.scrollIntoView({block:'end'});return d}
$('send').onclick=async()=>{const prompt=$('prompt').value.trim();if(!prompt)return;const btn=$('send');btn.disabled=true;bubble(prompt,'user');const pending=bubble('در حال پردازش…','bot');try{const res=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,organization:$('org').value,prompt})});const data=await res.json();pending.textContent=res.ok?(data.answer||JSON.stringify(data,null,2)):(data.error||'خطای درخواست');if(res.ok){lastAnswer=pending.textContent;$('prompt').value=''}}catch{pending.textContent='اتصال به سرور مانا برقرار نشد'}finally{btn.disabled=false}};
</script></body></html>`;
const manifest={name:'Mana AI — مانا',short_name:'مانا AI',lang:'fa',dir:'rtl',start_url:'/mobile',scope:'/',display:'standalone',background_color:'#0d1422',theme_color:'#101827',description:'رابط موبایل آزمایشی مانا AI؛ پردازش روی مدل محلی'};
module.exports={html,manifest};
