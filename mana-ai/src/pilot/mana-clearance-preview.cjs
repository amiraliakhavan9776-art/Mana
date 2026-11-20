'use strict';
// Read-only laboratory comparator. Not design validation or engineering approval.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const COMMAND='بیشتر: ۱۲۰۰ و ۷۵۰ میلی‌متر';
const DIAGNOSTIC_SHA='013cb896b7b630e34cdc28acb75f78591ad1fd1e2730ab881ba3969a98a23842';
const INTERPRETER_SHA='1241583c48b400833938799ea5538a7585cd8862444c930fea0b580741829261';
const CANDIDATE_SHA='e57f376ef7f7e2ed9fdff90564fba144a4ae6bead3547d289936ee7b236ee223';
const FIELDS=Object.freeze(['first_mm','second_mm']);
const MAX=100000;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const decimal='۰۱۲۳۴۵۶۷۸۹';
const receiptName='receipt.json';
const holdout=[[0,1],[0,83],[47,0],[841,617],[617,841],[1,1],[117,117],[20206,20207],[20207,20206],[99999,100000],[100000,99999],[99999,99999]];
const digit=s=>s.replace(/[۰-۹٠-٩]/gu,c=>String(c.charCodeAt(0)&15));
const local=n=>String(n).replace(/[0-9]/g,d=>decimal[Number(d)]);
const allowed=/^بیشتر\s*[:：]\s*(0|[1-9][0-9]{0,5})\s+و\s+(0|[1-9][0-9]{0,5})\s+میلی[‌ ]?متر$/u;
const recognized=s=>typeof s==='string'&&/^بیشتر(?:$|\s|[:：])/u.test(s.trim());
function pathIdentity(p){
 if(typeof p!=='string'||!path.isAbsolute(p)||path.resolve(p)!==p||fs.realpathSync(p)!==p)throw Error('Absolute private diagnostic workspace required');
 const x=fs.lstatSync(p);if(!x.isDirectory()||(x.mode&0o077)||(process.getuid&&x.uid!==process.getuid()))throw Error('Private diagnostic workspace required');
 return [x.dev,x.ino].join(':');
}
function evidenceHash(p){
 const fd=fs.openSync(path.join(p,receiptName),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size<1||s.size>64000||(s.mode&0o077)||(process.getuid&&s.uid!==process.getuid()))throw Error('Invalid diagnostic receipt');return sha(fs.readFileSync(fd));}
 finally{fs.closeSync(fd);}
}
function createClearancePreview({workspace,model}={}){
 if(typeof model!=='string'||model.includes('://')||!/^[A-Za-z0-9._:/-]{1,100}$/.test(model))throw Error('Original model receipt identifier required');
 const original=pathIdentity(workspace);
 const diagnostic=require.resolve('../../tools/mana-format-bench.cjs'),interpreter=require.resolve('../native/skill-expression.cjs');
 const assertSources=()=>{if(sha(fs.readFileSync(diagnostic))!==DIAGNOSTIC_SHA||sha(fs.readFileSync(interpreter))!==INTERPRETER_SHA)throw Error('Unreviewed preview source');};
 assertSources();
 const {benchmark}=require(diagnostic),{evaluateExpression}=require(interpreter);
 async function verify(){
  assertSources();if(pathIdentity(workspace)!==original)throw Error('Diagnostic workspace changed');
  const before=evidenceHash(workspace);
  const r=await benchmark({workspace,model,readOnly:true});
  if(pathIdentity(workspace)!==original||before!==evidenceHash(workspace))throw Error('Diagnostic receipt changed');
  const cell=r.results?.[5];
  if(r.status!=='COMPLETE'||r.reused!==true||r.modelRequestsAttemptedThisInvocation!==0||r.results.length!==6||cell?.task!=='controlling-clearance'||cell.format!=='prefix'||cell.status!=='PASSED'||cell.transport!=='RESPONSE'||!cell.formatValid||cell.score?.passed!==10||cell.score.total!==10||cell.probe?.length!==2||!cell.probe.every((v,i)=>v.field===FIELDS[i]&&v.effective===true)||sha(JSON.stringify(cell.candidate))!==CANDIDATE_SHA)throw Error('Original reviewed prefix slot not verified');
  for(const [first_mm,second_mm]of holdout){const actual=evaluateExpression(cell.candidate,{first_mm,second_mm},FIELDS);if(actual!==Math.max(first_mm,second_mm))throw Error('Independent holdout failed');}
  return {candidate:cell.candidate,receiptSha256:before};
 }
 async function preview(text){
  if(typeof text!=='string'||text.length>100||/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(text))return {status:'CLARIFY',message:'دو عدد صحیح همراه واحد میلی‌متر بفرست. نمونه: '+COMMAND};
  const m=digit(text.trim()).match(allowed);
  if(!m||Number(m[1])>MAX||Number(m[2])>MAX)return {status:'CLARIFY',message:'دو عدد صحیح از صفر تا ۱۰۰٬۰۰۰، بدون اعشار یا تبدیل واحد، با واحد میلی‌متر بفرست. نمونه: '+COMMAND};
  try{
   const {candidate,receiptSha256}=await verify();
   const first_mm=Number(m[1]),second_mm=Number(m[2]);
   const value=evaluateExpression(candidate,{first_mm,second_mm},FIELDS);
   return {status:'COMPLETED',kind:'clearance',message:first_mm===second_mm?'هر دو مقدار برابرند: '+local(value)+' میلی‌متر.':'مقدار بزرگ‌تر: '+local(value)+' میلی‌متر.',details:'پیش‌نمایش فقط‌خواندنی: پیشنهاد قالب فشرده در رسید اصلی ۱۰ از ۱۰، و در آزمون مستقل این پیش‌نمایش ۱۲ از ۱۲ قبول شد. هیچ درخواست مدل، فعال‌سازی مهارت یا تأیید مهندسی انجام نشد.\nشناسهٔ پیشنهاد: '+CANDIDATE_SHA+'\nهش رسید اصلی: '+receiptSha256,modelCalls:0,activated:false};
  }catch{return {status:'BLOCKED',message:'رسید اصلی یا آزمون مستقل قابل‌تأیید نبود؛ پیش‌نمایش متوقف شد. هیچ درخواست مدل یا محاسبهٔ جایگزین انجام نشد.',modelCalls:0,activated:false};}
 }
 return {matches:recognized,preview};
}
module.exports={createClearancePreview,COMMAND,recognized};
