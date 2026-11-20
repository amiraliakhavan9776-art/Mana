'use strict';
const {calculateSkirtingTakeoff}=require('../native/skirting-takeoff.cjs');
const COMMAND='قرنیز: طول ۵ متر، عرض ۴ متر، کسر ۰٫۹ متر';
const digits='۰۱۲۳۴۵۶۷۸۹', arabic='٠١٢٣٤٥٦٧٨٩';
const ascii=s=>s.replace(/[۰-۹٠-٩]/gu,c=>String(digits.includes(c)?digits.indexOf(c):arabic.indexOf(c))).replace(/٫/gu,'.');
const fa=s=>String(s).replace(/[0-9]/gu,d=>digits[Number(d)]).replace(/\./gu,'٫');
const number='(0|[1-9][0-9]{0,2})(?:\\.([0-9]{1,3}))?';
const shape=new RegExp('^قرنیز *[:：] *طول +'+number+' +متر *[،,] *عرض +'+number+' +متر *[،,] *کسر +'+number+' +متر$','u');
function matchesSkirting(text){return typeof text==='string'&&/^قرنیز(?:$|\s|[:：])/u.test(text.trim());}
const noSideEffects={modelCalls:0,activated:false};
function clarify(message){return {kind:'skirting',status:'CLARIFY',message,...noSideEffects};}
function previewSkirting(text){
 if(typeof text!=='string'||text.length>160||/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(text))return clarify('فقط سه اندازهٔ مشخص به متر بفرست. نمونه: '+COMMAND);
 const m=ascii(text.trim()).match(shape);
 if(!m)return clarify('طول و عرض داخل مستطیل و جمع عرض بخش‌های بدون قرنیز را جداگانه، هر سه به متر، بفرست. تا سه رقم اعشار مجاز است؛ اگر کسری نیست، «کسر ۰ متر» را بنویس. نمونه: '+COMMAND);
 const num=i=>m[i]+(m[i+1]===undefined?'':'.'+m[i+1]);
 try{
  const result=calculateSkirtingTakeoff({length_m:num(1),width_m:num(3),excluded_length_m:num(5)});
  return {kind:'skirting',status:'COMPLETED',message:'قرنیز خالص: '+fa(result.net_skirting_m)+' متر طول. محیط: '+fa(result.gross_perimeter_m)+' متر؛ کسر: '+fa(result.excluded_length_m)+' متر.',details:'طول داخلی: '+fa(result.geometry.length_m)+' متر؛ عرض داخلی: '+fa(result.geometry.width_m)+' متر.\nقاعده: دو برابر (طول + عرض)، منهای جمع عرض بخش‌های بدون قرنیز. محاسبهٔ بومی دقیق، بدون مدل یا گردکردن. مقدار خرید، پرت، بسته‌بندی، قیمت و تأیید اجرایی نیست.',takeoff:result,...noSideEffects};
 }catch(e){
  if(e.code==='DIMENSION_OUT_OF_RANGE')return clarify('طول و عرض داخلی باید بزرگ‌تر از صفر و حداکثر ۱۰۰ متر باشند.');
  if(e.code==='DEDUCTION_EXCEEDS_PERIMETER')return clarify('جمع عرض بخش‌های بدون قرنیز از محیط بیشتر است. اندازه‌ها و واحد را بررسی کن؛ مقدار خالص محاسبه نشد.');
  return {kind:'skirting',status:'BLOCKED',message:'محاسبهٔ دقیق این ورودی انجام نشد. نتیجه‌ای حدس زده نشد.',...noSideEffects};
 }
}
module.exports={COMMAND,matchesSkirting,previewSkirting};
