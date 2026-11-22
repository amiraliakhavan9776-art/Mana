'use strict';
const {fstatSync,openSync,closeSync,readSync,constants}=require('node:fs');
const {parseExactJSON}=require('../../src/exact-json.cjs');
const {SOURCE,SCHEMA,CASES}=require('./cases.cjs');
const FIELDS=['id','status','shape','inputUnit','dimensionsMm','formulaId','twiceAreaMm2','denominator','areaMm2','areaM2','sourceUrl','reasonCode'];
const rowKeys=[...FIELDS].sort().join(',');
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fmt=(num,den)=>{
 const whole=num/den;let rem=num%den,out=whole.toString(),digits='';
 while(rem){rem*=10n;digits+=(rem/den).toString();rem%=den;}
 return out+(digits?'.'+digits:'');
};
// Independent integer coordinate oracle; no import/call of the quantity engine,
// its source adapter, or its internal shoelace oracle.
function area2(shape,d){
 const [a,b,h0]=d.map(BigInt);
 // A fixed arbitrary skew drops out for every trapezoid; rectangle is an
 // origin shift of four orthogonal corners. Compute double area by triangles.
 const points=shape==='rectangle'?[[4n,5n],[4n+a,5n],[4n+a,5n+b],[4n,5n+b]]:
  [[4n,5n],[4n+a,5n],[33n+b,5n+h0],[33n,5n+h0]];
 const [o,u,v,w]=points, cross=(q,r)=>(q[0]-o[0])*(r[1]-o[1])-(q[1]-o[1])*(r[0]-o[0]);
 const crossSum=cross(u,v)+cross(v,w);
 return crossSum<0n?-crossSum:crossSum;
}
function expected(c){
 let reason=null;
 if(c.request!=='gross')reason='OUT_OF_SCOPE';
 else if(c.dimensions.some(n=>n===null))reason='PERPENDICULAR_HEIGHT_REQUIRED';
 else if(c.units.some(u=>u!==c.units[0]))reason='MIXED_UNITS';
 else if(c.units[0]!=='mm')reason='WHOLE_MILLIMETERS_REQUIRED';
 const core={id:c.id,status:reason?'ABSTAIN':'OK',shape:c.shape,inputUnit:reason?null:'mm',
  dimensionsMm:reason?null:c.dimensions,formulaId:null,twiceAreaMm2:null,denominator:null,areaMm2:null,areaM2:null,
  sourceUrl:null,reasonCode:reason};
 if(reason)return core;
 const num=area2(c.shape,c.dimensions);
 return {...core,formulaId:'gross-planar-'+c.shape+'-v1',twiceAreaMm2:num.toString(),denominator:2,
  areaMm2:fmt(num,2n),areaM2:fmt(num,2000000n),sourceUrl:SOURCE};
}
function equals(k,a,b){
 if(k==='dimensionsMm'&&Array.isArray(b))return Array.isArray(a)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
 return a===b;
}
function grade(answerText){
 let answer;
 const error=(code)=>({status:'FORMAT_REJECTED',code,passed:0,total:CASES.length,
  quantityPassed:0,quantityTotal:4,abstentionsPassed:0,abstentionsTotal:4,tracePassed:0,traceTotal:CASES.length,rows:[]});
 try {
  if(typeof answerText!=='string'||Buffer.byteLength(answerText)>16384)return error('INPUT_LIMIT');
  answer=parseExactJSON(answerText);
 }catch{return error('EXACT_JSON_REQUIRED');}
 if(!isObject(answer)||Object.keys(answer).sort().join(',')!=='results,schema'||answer.schema!==SCHEMA||
   !Array.isArray(answer.results)||answer.results.length>CASES.length)return error('ROOT_SCHEMA_INVALID');
 const got=new Map();
 for(const r of answer.results){
  if(!isObject(r)||typeof r.id!=='string'||got.has(r.id)||!CASES.some(c=>c.id===r.id))return error('DUPLICATE_OR_UNKNOWN_CASE');
  got.set(r.id,r);
 }
 let passed=0,quantityPassed=0,abstentionsPassed=0,tracePassed=0;
 const rows=CASES.map(c=>{
  const want=expected(c),row=got.get(c.id);
  if(!row)return {id:c.id,passed:false,problems:['MISSING_CASE']};
  if(Object.keys(row).sort().join(',')!==rowKeys)return {id:c.id,passed:false,problems:['ROW_SCHEMA_INVALID']};
  const problems=FIELDS.filter(k=>!equals(k,row[k],want[k]));
  if(want.status==='OK'&&!problems.some(k=>['status','twiceAreaMm2','denominator','areaMm2','areaM2'].includes(k)))quantityPassed++;
  if(want.status==='ABSTAIN'&&!problems.length)abstentionsPassed++;
  if(!problems.some(k=>['status','shape','inputUnit','dimensionsMm','formulaId','sourceUrl','reasonCode'].includes(k)))tracePassed++;
  if(!problems.length)passed++;
  return {id:c.id,passed:!problems.length,problems};
 });
 return {status:passed===CASES.length?'ALL_CASES_PASSED':'NOT_ALL_CASES_PASSED',passed,total:CASES.length,
  quantityPassed,quantityTotal:4,abstentionsPassed,abstentionsTotal:4,tracePassed,traceTotal:CASES.length,rows};
}
function readResponse(p){
 const fd=openSync(p,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const st=fstatSync(fd);if(!st.isFile()||st.size<1||st.size>16384)throw Error('ANSWER_FILE_LIMIT');
  const b=Buffer.alloc(st.size+1);let n=0;while(n<b.length){const got=readSync(fd,b,n,b.length-n,null);if(!got)break;n+=got;}
  if(n!==st.size)throw Error('ANSWER_CHANGED_WHILE_READING');
  return new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(0,n));
 }finally{closeSync(fd);}
}
if(require.main===module){
 try{
  if(process.argv.length!==3)throw Error('Usage: node grade.cjs answer.json');
  const result=grade(readResponse(process.argv[2]));console.log(JSON.stringify(result,null,2));
  if(result.status!=='ALL_CASES_PASSED')process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=2;}
}
module.exports={grade};
