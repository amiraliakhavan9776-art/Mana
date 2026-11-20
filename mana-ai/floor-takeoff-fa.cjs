'use strict';
const {calculateFloorTakeoff}=require('./src/native/floor-takeoff.cjs');
const labels={length_m:'طول',width_m:'عرض',excluded_area_m2:'مساحتِ کسرشده'};
const units={length_m:'متر',width_m:'متر',excluded_area_m2:'مترمربع'};
const example='مساحت خالص کف مستطیل، طول ۵ متر، عرض ۴ متر، مساحت کسرشده ۳ مترمربع';
const host={modelCalls:0,modelTrainingPerformed:false,productionDeploymentAllowed:false};
const digits='۰۱۲۳۴۵۶۷۸۹';
const local=s=>String(s).replace(/[0-9]/g,d=>digits[+d]).replace('.', '٫');
const clean=s=>s.replace(/[۰-۹٠-٩]/g,c=>String(c.charCodeAt(0)&15)).replace(/٫/g,'.').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[‌\u00a0]/g,' ').replace(/\s+/g,' ').trim();
const labelPattern=/(^|[\s،,؛;])(مساحت\s+کسر\s*شده|سطح\s+کسر\s*شده|طول|عرض)(?=$|[\s:=\d])/gu;
const numbers=/^[:=]?\s*(\d{1,5}(?:\.\d{1,6})?)(?:\s*(.*))?$/u;
const heading=/^(?:(?:لطفا\s+)?(?:مساحت خالص کف|مساحت کف|کف مستطیل)(?:\s+(?:اتاق|مستطیل|اتاق مستطیل))?(?:\s+با)?\s*[:،,؛;]?)?$/u;
const slash=s=>s.trim().replace(/[،,؛;]+\s*$/u,'').trim().replace(/\s+و$/u,'').trim();
const unitKey=u=>/^(?:متر\s*مربع|m2|m²)$/iu.test(u)?'m2':/^(?:متر|m)$/iu.test(u)?'m':null;
function takeoffFromPersian(source){
 if(typeof source!=='string'||source.length===0||source.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e\u2066-\u2069]/u.test(source))return {status:'INVALID_TEXT',message:'یک درخواست کوتاه با عدد و واحد مشخص بفرست. نمونه: '+example,...host};
 let s=clean(source).replace(/\s+(?:را\s+|رو\s+)?(?:حساب کن|محاسبه کن)[؟.!]?$/u,'').trim().replace(/[؟!]+$/u,'').trim();
 s=s.replace(/(?:^|[\s،,؛;])بدون کسر(?: مساحت)?$/u,'، مساحت کسرشده 0 مترمربع');
 const markers=[...s.matchAll(labelPattern)];
 if(!heading.test((markers.length?s.slice(0,markers[0].index):s).trim()))return {status:'UNSUPPORTED_TEXT',message:'این نسخه فقط دستور مشخصِ کف مستطیلی رو می‌پذیره و از متن مبهم عدد حدس نمی‌زنه. نمونه: '+example,...host};
 const parsed={},seen=new Set(),problems={};
 for(let i=0;i<markers.length;i++){
  const a=markers[i],k=a[2]==='طول'?'length_m':a[2]==='عرض'?'width_m':'excluded_area_m2';
  if(seen.has(k)){problems[k]='تکراری است؛ فقط یک مقدار بفرست';continue;}seen.add(k);
  const fragment=slash(s.slice(a.index+a[0].length,markers[i+1]?.index??s.length)),m=fragment.match(numbers);
  if(!m){problems[k]='عدد نامعتبر است؛ عددِ غیرمنفی با حداکثر شش رقم اعشار بفرست';continue;}
  const expected=k==='excluded_area_m2'?'m2':'m',actual=unitKey(m[2]?.trim()??'');
  if(actual!==expected){problems[k]=m[2]?'واحد قابل قبول «'+units[k]+'» است':'واحد «'+units[k]+'» را مشخص کن';continue;}
  parsed[k]=m[1].replace(/^0+(?=\d)/u,'');
 }
 for(const k of Object.keys(labels))if(!seen.has(k))problems[k]='مقدار را به '+units[k]+' مشخص کن'+(k==='excluded_area_m2'?'؛ اگر کسری نیست بگو «بدون کسر»':'');
 if(Object.keys(problems).length)return {status:'NEEDS_INPUT',fields:Object.keys(problems),message:Object.entries(problems).map(([k,t])=>labels[k]+': '+t).join('؛ ')+'؛ لطفاً درخواست کامل رو بفرست.',...host};
 try{
  const result=calculateFloorTakeoff(parsed);
  const message='مساحت خالص کف: '+local(result.net_area_m2)+' مترمربع. مساحت کل: '+local(result.gross_area_m2)+' مترمربع؛ مساحت کسرشده: '+local(result.excluded_area_m2)+' مترمربع.'+(result.clamped?' کسر از مساحت کل بیشتر بود، پس نتیجه صفر شد.':'');
  return {...result,status:'FLOOR_TAKEOFF_CALCULATED',message,...host};
 }catch(e){if(!['INVALID_INPUT','INVALID_DECIMAL','OUT_OF_RANGE'].includes(e?.code))throw e;return {status:'INVALID_INPUT',code:e.code,message:'ورودی مجاز: طول و عرض از صفر تا ۱۰۰ متر؛ مساحت کسرشده از صفر تا ۱۰٬۰۰۰ مترمربع؛ حداکثر شش رقم اعشار.',...host};}
}
if(require.main===module){
 const [input,...extra]=process.argv.slice(2);
 if(!input||extra.length){console.log('روش اجرا: node floor-takeoff-fa.cjs «یک دستور داخل گیومهٔ شل»\nنمونه: '+example);process.exitCode=1;}
 else {const r=takeoffFromPersian(input);console.log(JSON.stringify(r,null,2));if(r.status!=='FLOOR_TAKEOFF_CALCULATED')process.exitCode=2;}
}
module.exports={takeoffFromPersian};
