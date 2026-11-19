'use strict';
// Arithmetic verification only. Parsed rows are never promoted to verified financial evidence.
const {createHash}=require('node:crypto');
const exact=require('../financial/exact-decimal.cjs');
const MAX_BYTES=100000,MAX_ROWS=500;
const sample='شرح,مبلغ\nخرید نمونه مصالح,۱۲۰۰۰\nحمل نمونه,۳۰۰۰\n';
function money(value){
 if(typeof value!=='string')throw Error('مبلغ باید متن عدد صحیح باشد.');
 const s=value.trim().replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
 if(!/^(?:0|[1-9]\d{0,23})$/.test(s))throw Error('مبلغ باید عدد صحیح نامنفی، بدون جداکننده، ممیز یا واحد و حداکثر ۲۴ رقم باشد.');
 return exact.decimal(s);
}
function parseCSV(source){
 if(typeof source!=='string'||Buffer.byteLength(source)>MAX_BYTES||source.includes('\0'))throw Error('ورودی CSV نامعتبر یا بزرگ‌تر از حد مجاز است.');
 const text=source.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
 const records=[];let cells=[],cell='',quoted=false,closed=false,line=1,start=1;
 const endCell=()=>{cells.push(cell);cell='';closed=false;};
 const endRow=()=>{endCell();if(cells.some(x=>x.trim()))records.push({cells,line:start,endLine:line});cells=[];start=line+1;if(records.length>MAX_ROWS+1)throw Error('حداکثر ۵۰۰ ردیف مجاز است.');};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else{cell+=c;if(c==='\n')line++;}continue;}
  if(c==='"'){if(cell||closed)throw Error('نقل‌قول CSV نامعتبر است.');quoted=true;}
  else if(c===',')endCell();
  else if(c==='\n'){endRow();line++;}
  else{if(closed)throw Error('پس از نقل‌قول فقط جداکننده یا پایان خط مجاز است.');cell+=c;}
 }
 if(quoted)throw Error('نقل‌قول CSV بسته نشده است.');
 if(cell||cells.length||closed)endRow();
 const header=records.shift();
 if(!header||header.cells.length!==2||!['شرح|مبلغ','description|amount'].includes(header.cells.map(x=>x.trim()).join('|')))throw Error('سطر اول باید دقیقاً شرح,مبلغ یا description,amount باشد.');
 if(!records.length)throw Error('حداقل یک ردیف هزینه لازم است.');
 return records.map(r=>{
  if(r.cells.length!==2||!r.cells[0].trim()||r.cells[0].length>500)throw Error('شرح یا تعداد ستون‌ها در سطر '+r.line+' نامعتبر است.');
  if(/^(جمع|جمع کل|جمع هزینه‌ها|مجموع|total|subtotal|grand total)$/i.test(r.cells[0].trim()))throw Error('سطر '+r.line+' ظاهراً جمع است؛ فقط ردیف‌های هزینه را وارد کنید و جمع را جدا بنویسید.');
  let amount;try{amount=exact.format(money(r.cells[1]));}catch(e){throw Error('سطر '+r.line+': '+e.message);}
  return {sourceLine:r.line,sourceEndLine:r.endLine,description:r.cells[0].trim(),amount};
 });
}
function reviewExpense(input){
 if(!input||Array.isArray(input)||Object.keys(input).sort().join('|')!=='csv|currency|declaredTotal|request')throw Error('ساختار درخواست نامعتبر است.');
 const request=input.request;
 if(typeof request!=='string'||request.length>1000||!/(هزینه|صورت|جمع)/.test(request)||!/(بررسی|حساب|کنترل|جمع|تطبیق)/.test(request))throw Error('این پایلوت فقط درخواست بررسی جمع صورت هزینه را پشتیبانی می‌کند.');
 if(!['IRR','TOMAN'].includes(input.currency))throw Error('واحد مبلغ را صریحاً انتخاب کنید.');
 const declared=money(input.declaredTotal),rows=parseCSV(input.csv);
 let sum=exact.zero();for(const row of rows)sum=exact.add(sum,money(row.amount));
 const duplicates=[];const seen=new Map();
 for(const row of rows){const key=JSON.stringify([row.description,row.amount]);if(seen.has(key))duplicates.push([seen.get(key),row.sourceLine]);else seen.set(key,row.sourceLine);}
 const difference=exact.format(exact.sub(sum,declared));
 return {schema:'MANA_EXPENSE_REVIEW_V1',status:difference==='0'?'TOTAL_MATCH':'TOTAL_MISMATCH',request,currency:input.currency,sourceSha256:createHash('sha256').update(input.csv).digest('hex'),plan:['خواندن CSV و ثبت شماره سطر منبع','کنترل عدد صحیح و واحد انتخاب‌شده','جمع دقیق همه ردیف‌ها بدون حذف تکرار','مقایسه با جمع اعلامی و گزارش اختلاف'],rows,calculatedTotal:exact.format(sum),declaredTotal:exact.format(declared),difference,duplicates,scope:'فقط صحت جمع داده‌های واردشده بررسی شده است؛ اصالت فاکتور، پرداخت، مالکیت، مالیات و استحقاق مالی تأیید نشده‌اند. ردیف‌های مشابه حذف نشده‌اند. داده در سرور ذخیره نمی‌شود.',productionPostingAllowed:false};
}
module.exports={reviewExpense,parseCSV,money,sample,MAX_BYTES};
