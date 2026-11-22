'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {ID}=require('./aec-source.cjs');
const INDEX_URL='https://www.grc.nasa.gov/www/k-12/airplane/short.html';
const AREA_URL='https://www.grc.nasa.gov/www/k-12/airplane/area.html';
const LIMIT=384*1024, BUDGET_MS=15000;
const PROFILES=Object.freeze({'direct':'DIRECT_OFFICIAL_HTTPS','pinned-capture':'OPERATOR_PINNED_RAW_REPLAY'});
const SCOPE='Planar gross geometric trapezoid area only. No deductions, pay quantities, contractual, regulatory, or structural interpretation.';
const ANCHORS=[
 [11,5,3],[12,5,3],[11,6,3],[11,5,4],[2,9,5],[3,8,4],[21,19,17],
 [100,99,3],[1,1,1],[2,1,1],[1,2,2],[9,4,7],[23,91,17],[1234,4321,9876],
].map(Object.freeze);
const FIELDS=['base_a_mm','base_b_mm','height_mm'];
const sha=x=>createHash('sha256').update(x).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const abs=p=>typeof p==='string'&&p.length<4096&&!p.includes('\0')&&path.isAbsolute(p)&&path.resolve(p)===p;
const need=(ok,reason)=>{if(!ok)throw Error(reason);};
function pubTime(x){
 return typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
}
function fetchNasa(url,request=https.request){
 return new Promise((resolve,reject)=>{
  if(url!==INDEX_URL&&url!==AREA_URL)return reject(Error('NASA_URL_NOT_APPROVED'));
  let req,timer,settled=false;
  const fail=reason=>{if(settled)return;settled=true;clearTimeout(timer);reject(Error(reason));req?.destroy();};
  try{
   req=request(url,{method:'GET',rejectUnauthorized:true,maxHeaderSize:16384,headers:{
    Accept:'text/html','Accept-Encoding':'identity','User-Agent':'MANA-nasa-area-evidence/1.0',
   }},res=>{
    if(settled)return;
    if(res.statusCode!==200)return fail('NASA_HTTPS_STATUS_REJECTED');
    const mime=String(res.headers['content-type']??'').split(';',1)[0].trim().toLowerCase();
    if(mime!=='text/html'||!['','identity'].includes(res.headers['content-encoding']??''))return fail('NASA_HTTPS_MEDIA_REJECTED');
    const declared=res.headers['content-length'];
    if(declared!==undefined&&(!/^\d{1,8}$/.test(declared)||Number(declared)<1||Number(declared)>LIMIT))
     return fail('NASA_HTTPS_BODY_REJECTED');
    const chunks=[];let n=0;
    res.on('data',chunk=>{if(settled)return;n+=chunk.length;if(n>LIMIT)return fail('NASA_HTTPS_BODY_REJECTED');chunks.push(chunk);});
    res.on('error',()=>fail('NASA_HTTPS_INCOMPLETE'));
    res.on('aborted',()=>fail('NASA_HTTPS_INCOMPLETE'));
    res.on('end',()=>{
     if(settled)return;
     if(!res.complete||!n||(declared!==undefined&&Number(declared)!==n))return fail('NASA_HTTPS_INCOMPLETE');
     settled=true;clearTimeout(timer);
     resolve({url,bytes:Buffer.concat(chunks,n),retrievedAt:new Date().toISOString()});
    });
   });
   if(!settled)timer=setTimeout(()=>fail('NASA_HTTPS_TIMEOUT'),BUDGET_MS);
   req.on('error',()=>fail('NASA_HTTPS_REQUEST_FAILED'));
   req.end();
  }catch{fail('NASA_HTTPS_REQUEST_FAILED');}
 });
}
function readRaw(file,expected){
 need(abs(file)&&hex(expected)&&fs.realpathSync(file)===file,'NASA_CAPTURE_PATH_OR_PIN_REJECTED');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK|fs.constants.O_NOFOLLOW);
 try{
  const st=fs.fstatSync(fd);need(st.isFile()&&st.size>0&&st.size<=LIMIT,'NASA_CAPTURE_FILE_REJECTED');
  const b=Buffer.alloc(st.size+1);let i=0;
  while(i<b.length){const n=fs.readSync(fd,b,i,b.length-i,null);if(n===0)break;i+=n;}
  need(i===st.size,'NASA_CAPTURE_FILE_CHANGED');
  const bytes=b.subarray(0,i);need(sha(bytes)===expected,'NASA_CAPTURE_PIN_MISMATCH');return bytes;
 }finally{fs.closeSync(fd);}
}
function rawReplayReader(directory,indexPin,areaPin){
 need(abs(directory)&&hex(indexPin)&&hex(areaPin)&&fs.realpathSync(directory)===directory&&fs.lstatSync(directory).isDirectory(),'NASA_CAPTURE_DIRECTORY_OR_PINS_REJECTED');
 return async ({url})=>{
  need(url===INDEX_URL||url===AREA_URL,'NASA_URL_NOT_APPROVED');
  const name=url===INDEX_URL?'index.html':'area.html';
  const bytes=readRaw(path.join(directory,name),url===INDEX_URL?indexPin:areaPin);
  return {url,bytes,retrievedAt:null};
 };
}
function html(pythonPath,kind,data){
 need(abs(pythonPath),'NASA_PYTHON_PATH_REQUIRED');
 need(Buffer.isBuffer(data)&&data.length>0&&data.length<=LIMIT,'NASA_HTML_BYTES_REJECTED');
 const helper=path.join(__dirname,'nasa-area-html.py');
 const r=spawnSync(pythonPath,['-I','-B',helper,kind],{cwd:'/',input:data,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},
  stdio:['pipe','pipe','pipe'],timeout:6000,maxBuffer:16*1024,killSignal:'SIGKILL',shell:false});
 if(r.error?.code==='ETIMEDOUT')throw Error('NASA_EXTRACTOR_TIMEOUT');
 if(r.error||r.signal)throw Error('NASA_EXTRACTOR_START_OR_OUTPUT_FAILED');
 if(r.status!==0){
  const label=Buffer.isBuffer(r.stderr)?r.stderr.toString().trim():'';
  throw Error(/^NASA_[A-Z_]{1,80}$/.test(label)?label:'NASA_EXTRACTION_FAILED');
 }
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(r.stdout));}catch{throw Error('NASA_EXTRACTOR_OUTPUT_INVALID');}
}
function normalizedRaw(row,url,mode){
 need(row?.url===url&&Buffer.isBuffer(row.bytes)&&row.bytes.length>0&&row.bytes.length<=LIMIT&&
  (mode==='pinned-capture'?row.retrievedAt===null:pubTime(row.retrievedAt)),'NASA_RAW_CAPTURE_INVALID');
 return {url,sha256:sha(row.bytes),byteCount:row.bytes.length,retrievedAt:row.retrievedAt};
}
function approvedHref(href){
 need(typeof href==='string'&&href.length>0&&href.length<2048&&!/[\s\\]/u.test(href),'NASA_AREA_LINK_NOT_APPROVED');
 let u;try{u=new URL(href,INDEX_URL);}catch{throw Error('NASA_AREA_LINK_NOT_APPROVED');}
 need(u.href===AREA_URL&&!u.username&&!u.password&&!u.search&&!u.hash,'NASA_AREA_LINK_NOT_APPROVED');
 return u.href;
}
const PLANAR_LAYOUT_CODES=new Set(['NASA_PLANAR_PRECEDING_EVIDENCE_MISSING','NASA_PLANAR_PARAGRAPH_PREFIX_MISSING','NASA_PLANAR_FORBIDDEN_SCOPE']);
function scopeDiagnostic(code,d){
 return PLANAR_LAYOUT_CODES.has(code)&&d&&typeof d==='object'&&!Array.isArray(d)&&Object.keys(d).length===3&&
  ['matchingDimensionCueInClause','openingSentenceLaterInClause','priorCleanParagraphCount'].every(k=>Object.hasOwn(d,k))&&
  typeof d.matchingDimensionCueInClause==='boolean'&&typeof d.openingSentenceLaterInClause==='boolean'&&
  Number.isInteger(d.priorCleanParagraphCount)&&d.priorCleanParagraphCount>=0&&d.priorCleanParagraphCount<=4;
}
function relation(record){
 const c=record?.clause,e=record?.earlier;
 need(typeof c?.text==='string'&&c.text.length<5000&&Number.isSafeInteger(c.line)&&c.line>=0&&Array.isArray(e)&&e.length<=4,
  'NASA_PLANAR_EVIDENCE_SHAPE_INVALID');
 const dimensionCue=/(?:^|[.!?]\s+)The area is the two-dimensional amount of space\b.*\bdimensions of length squared\b/;
 // Diagnostics classify failure but cannot supply new proof or change order.
 const prefix='On the slide we have listed the formula to calculate the area of a variety of shapes:';
 const text=c.text.replace(/\s+/g,' ');
 function scopeFailure(message){
  const failure=Error(message);
  failure.scopeDiagnostics={
   matchingDimensionCueInClause:dimensionCue.test(c.text),
   openingSentenceLaterInClause:text.indexOf(prefix,1)!==-1,
   priorCleanParagraphCount:e.length,
  };
  throw failure;
 }
 if(!e.some(v=>dimensionCue.test(v.text)))scopeFailure('NASA_PLANAR_PRECEDING_EVIDENCE_MISSING');
 // Require this single clause inside the shapes discussion, and close it
 // before its independently named neighbor. No formulas from any other shape.
 if(!text.startsWith(prefix))scopeFailure('NASA_PLANAR_PARAGRAPH_PREFIX_MISSING');
 if(/\b(?:net|deductions?|volume|contractual|pay quantit(?:y|ies))\b/i.test(text))scopeFailure('NASA_PLANAR_FORBIDDEN_SCOPE');
 const match=/\bThe equation for the area of a trapezoid is (one half) the sum of the top (t) and bottom (b) times the height (h);\s*A\s*=\s*([tbh])\s*([*×])\s*\[\s*([tbh])\s*([+\-])\s*([tbh])\s*\]\s*\/\s*([1-9]\d?)\s*(?=The area of a triangle is|$)/.exec(text);
 need(match,'NASA_TRAPEZOID_CLAUSE_NOT_SUPPORTED');
 const [,ratio,top,bottom,height,factor,mul,left,add,right,divisor]=match;
 const named=new Map([[top,0],[bottom,1],[height,2]]);
 const ops={'+':(a,b)=>a+b,'*':(a,b)=>a*b,'×':(a,b)=>a*b};
 const expectedDivisor=ratio==='one half'?2:null;
 need(named.get(factor)===2&&[left,right].every(v=>named.has(v)&&named.get(v)<2)&&left!==right&&
  add==='+'&&Number(divisor)===expectedDivisor&&Object.hasOwn(ops,mul),'NASA_FORMULA_ROLE_OR_PROSE_MISMATCH');
 const fit={schema:'MANA_INTEGER_EXAMPLES_V1',id:ID,fields:FIELDS.map(id=>({id,power:1,max:100000})),outputPower:2,
  examples:ANCHORS.map(row=>[[...row],ops[mul](row[named.get(factor)],ops[add](row[named.get(left)],row[named.get(right)]))])};
 return {fit,planar:{line:c.line,clauseSha256:sha(match[0].trim()),output:{numerator:'twice_area',denominator:Number(divisor),unit:'mm²'},
  input:{unit:'mm',min:1,max:100000,roles:['parallel-base','parallel-base','perpendicular-height']}}};
}
async function discoverNasaArea({mode,pythonPath,reader,request}={}){
 need(Object.hasOwn(PROFILES,mode),'NASA_SOURCE_MODE_REJECTED');
 const choose=reader??(mode==='direct'?({url})=>fetchNasa(url,request):null);
 need(typeof choose==='function'&&abs(pythonPath),'NASA_READER_OR_PYTHON_REQUIRED');
 function staged(error,stage){
  const failure=Error(typeof error?.message==='string'?error.message:'NASA_SOURCE_UNVERIFIED');
  failure.sourceStage=stage;
  if(stage==='selected-link'&&scopeDiagnostic(error?.message,error?.scopeDiagnostics))
   failure.scopeDiagnostics={...error.scopeDiagnostics};
  throw failure;
 }
 let index,link;
 try{
  const initial=await choose({kind:'index',url:INDEX_URL,label:'Area'});
  index=normalizedRaw(initial,INDEX_URL,mode);
  const selected=html(pythonPath,'index',initial.bytes);
  need(selected?.label==='Area'&&selected.section==='Math Fundamentals'&&Number.isSafeInteger(selected.line)&&selected.line>0,'NASA_AREA_LINK_NOT_APPROVED');
  link={...selected,url:approvedHref(selected.href)};
 }catch(error){staged(error,'index');}
 let source,fit,planar;
 try{
  const next=await choose({kind:'selected-link',url:link.url,indexUrl:INDEX_URL,link:{...link}});
  source=normalizedRaw(next,link.url,mode);
  ({fit,planar}=relation(html(pythonPath,'lesson',next.bytes)));
 }catch(error){staged(error,'selected-link');}
 return {schema:'MANA_NASA_AREA_EVIDENCE_V1',sourceMode:mode,transport:PROFILES[mode],
  captureRepresentation:'RAW_HTML',visibilityAssessment:'STATIC_HTML_PROFILE_NOT_BROWSER_RENDERING',index,link,source,planar,scope:SCOPE,fit};
}
module.exports={INDEX_URL,AREA_URL,PROFILES,SCOPE,fetchNasa,rawReplayReader,discoverNasaArea,scopeDiagnostic};
