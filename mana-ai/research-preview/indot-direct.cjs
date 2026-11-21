'use strict';
const https=require('node:https');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {spawn}=require('node:child_process');
const {INDEX_URL,SOURCE_URL,ID}=require('./aec-source.cjs');
const PDF_SHA256='61cee6fc891b0121c424e3c9b8ee1610e87c06341c38c916123ac82850692968';
const PDF_BYTES=3893353;
const HELPER=path.join(__dirname,'indot-direct.py');
const TITLE='2026 Construction Procedures I';
const SECTION='Certified Technician Program Manuals';
const LIMITS=Object.freeze({[INDEX_URL]:1024*1024,[SOURCE_URL]:8*1024*1024});
const MODES=Object.freeze({[INDEX_URL]:'text/html',[SOURCE_URL]:'application/pdf'});
const MAX=100000;
const FIELDS=Object.freeze(['base_a_mm','base_b_mm','height_mm']);
const ANCHORS=Object.freeze([
 [11,5,3],[12,5,3],[11,6,3],[11,5,4],[2,9,5],[3,8,4],[21,19,17],
 [100,99,3],[1,1,1],[2,1,1],[1,2,2],[9,4,7],[23,91,17],[1234,4321,9876],
].map(Object.freeze));
const need=(ok,code)=>{if(!ok)throw Error(code);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=value=>hash(JSON.stringify(value));
const hex=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const isPythonPath=s=>typeof s==='string'&&s.length<4096&&!s.includes('\0')&&path.isAbsolute(s)&&path.resolve(s)===s;
const INDOT_HTTPS_DEADLINE_MS=15000;
function fetchOfficial(url,request=https.request,observe) {
 return new Promise((resolve,reject)=>{
  if(!Object.hasOwn(LIMITS,url))return reject(Error('INDOT_URL_NOT_APPROVED'));
  const bytesLimit=LIMITS[url], type=MODES[url];
  let timer,req,settled=false;
  const monitored=typeof observe==='function';
  const start=monitored?performance.now():0;
  const elapsed=()=>Math.round(performance.now()-start);
  let headersMs=null,firstBodyByteMs=null,size=0;
  const report=()=>{
   if(monitored)try{observe({elapsedMs:elapsed(),headersMs,firstBodyByteMs,bytesReceived:size});}catch{/* metrics cannot affect transport */}
  };
  const fail=code=>{
   if(settled)return;
   settled=true;clearTimeout(timer);report();reject(Error(code));req?.destroy();
  };
  const onResponse=res=>{
   if(settled)return;
   if(monitored)headersMs=elapsed();
   if(res.statusCode!==200)return fail('INDOT_HTTPS_STATUS_REJECTED');
   const mime=String(res.headers['content-type']??'').split(';',1)[0].trim().toLowerCase();
   if(mime!==type||!['identity',''].includes(res.headers['content-encoding']??''))return fail('INDOT_HTTPS_MEDIA_REJECTED');
   const announced=res.headers['content-length'];
   if(announced!==undefined&&(!/^\d{1,10}$/.test(announced)||Number(announced)<1||Number(announced)>bytesLimit))return fail('INDOT_HTTPS_BODY_REJECTED');
   const chunks=[];
   res.on('data',chunk=>{
    if(settled)return;
    if(monitored&&chunk.length>0&&firstBodyByteMs===null)firstBodyByteMs=elapsed();
    size+=chunk.length;
    if(size>bytesLimit)return fail('INDOT_HTTPS_BODY_REJECTED');
    chunks.push(chunk);
   });
   res.on('aborted',()=>fail('INDOT_HTTPS_INCOMPLETE'));
   res.on('error',()=>fail('INDOT_HTTPS_INCOMPLETE'));
   res.on('end',()=>{
    if(settled)return;
    if(!res.complete||size<1||(announced!==undefined&&size!==Number(announced)))return fail('INDOT_HTTPS_INCOMPLETE');
    settled=true;clearTimeout(timer);report();
    resolve({bytes:Buffer.concat(chunks,size),retrievedAt:new Date().toISOString()});
   });
  };
  try{
   req=request(url,{method:'GET',rejectUnauthorized:true,maxHeaderSize:16384,headers:{
    Accept:type,'Accept-Encoding':'identity','User-Agent':'MANA-indot-evidence/1.0',
   }},onResponse);
   if(!settled)timer=setTimeout(()=>fail('INDOT_HTTPS_TIMEOUT'),INDOT_HTTPS_DEADLINE_MS);
   req.on('error',()=>fail('INDOT_HTTPS_REQUEST_FAILED'));
   req.end();
  }catch(e){
   if(!monitored)throw e;
   fail('INDOT_HTTPS_REQUEST_FAILED');
  }
 });
}
function helper(pythonPath,mode,bytes) {
 need(isPythonPath(pythonPath),'INDOT_PYTHON_PATH_REQUIRED');
 need(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=8*1024*1024,'INDOT_DOCUMENT_BYTES_REQUIRED');
 return new Promise((resolve,reject)=>{
  const child=spawn(pythonPath,['-I','-B',HELPER,mode],{
   shell:false,cwd:'/',env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},
   stdio:['pipe','pipe','pipe'],windowsHide:true,
  });
  let timer, settled=false, stdout=Buffer.alloc(0),stderr=Buffer.alloc(0);
  const fail=(code)=>{
   if(settled)return;
   settled=true;clearTimeout(timer);child.kill('SIGKILL');reject(Error(code));
  };
  timer=setTimeout(()=>fail('INDOT_EXTRACTOR_TIMEOUT'),12000);
  child.once('error',()=>fail('INDOT_EXTRACTOR_START_FAILED'));
  child.stdin.on('error',e=>{if(e.code!=='EPIPE')fail('INDOT_EXTRACTOR_INPUT_FAILED');});
  child.stdout.on('data',b=>{
   if(stdout.length+b.length>16384)return fail('INDOT_EXTRACTOR_OUTPUT_LIMIT');
   stdout=Buffer.concat([stdout,b]);
  });
  child.stderr.on('data',b=>{
   if(stderr.length+b.length>4096)return fail('INDOT_EXTRACTOR_OUTPUT_LIMIT');
   stderr=Buffer.concat([stderr,b]);
  });
  child.stdout.on('error',()=>fail('INDOT_EXTRACTOR_OUTPUT_FAILED'));
  child.stderr.on('error',()=>fail('INDOT_EXTRACTOR_OUTPUT_FAILED'));
  child.once('close',code=>{
   if(settled)return;
   if(code!==0){
    const label=stderr.toString().trim();
    return fail(/^INDOT_[A-Z_]{1,64}$/.test(label)?label:'INDOT_EXTRACTOR_FAILED');
   }
   try {
    const output=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(stdout));
    settled=true;clearTimeout(timer);resolve(output);
   }catch{return fail('INDOT_EXTRACTOR_OUTPUT_INVALID');}
  });
  child.stdin.end(bytes);
 });
}
async function inspectIndex(indexBytes,pythonPath) {
 need(Buffer.isBuffer(indexBytes)&&indexBytes.length>0&&indexBytes.length<=LIMITS[INDEX_URL],'INDOT_INDEX_BYTES_REJECTED');
 const anchor=await helper(pythonPath,'index',indexBytes);
 const href=new URL(SOURCE_URL).pathname+new URL(SOURCE_URL).search;
 need(anchor?.href===href&&anchor.section===SECTION&&anchor.label===TITLE&&Number.isInteger(anchor.indexLine)&&anchor.indexLine>0,
  'INDOT_LINK_NOT_APPROVED');
 const selected=new URL(anchor.href,INDEX_URL).href;
 need(selected===SOURCE_URL,'INDOT_LINK_NOT_APPROVED');
 const link={...anchor,url:selected};
 return {...link,sha256:digest(link)};
}
async function inspectPdf(pdfBytes,pythonPath) {
 need(Buffer.isBuffer(pdfBytes)&&pdfBytes.length===PDF_BYTES&&hash(pdfBytes)===PDF_SHA256,'INDOT_PDF_REVISION_MISMATCH');
 const info=await helper(pythonPath,'pdf',pdfBytes);
 need(info?.pageIndex===12&&info.printedPage==='1-3'&&info.pdfSha256===PDF_SHA256&&hex(info.pageTextSha256)&&hex(info.proseSha256)
  &&typeof info.extractorVersion==='string'&&/^\d+\.\d+\.\d+$/.test(info.extractorVersion),'INDOT_EXTRACTOR_OUTPUT_INVALID');
 const {structure:s}=info;
 const validBox=b=>Array.isArray(b)&&b.length===4&&b.every(n=>Number.isFinite(n)&&n>=0&&n<=2000)&&b[0]<b[2]&&b[1]<b[3];
 need(s?.numerator?.tokens?.join(',')==='B1,+,B2'&&s.denominator?.value===2&&s.multiplier?.tokens?.join(',')==='×,H'
  &&[s.numerator.box,s.denominator.box,s.multiplier.opBox,s.multiplier.heightBox,s.equalsBox].every(validBox),
  'INDOT_EXTRACTOR_FORMULA_INVALID');
 return info;
}
function makeFit(info) {
 const {numerator,denominator,multiplier}=info.structure;
 const bases=[numerator.tokens[0],numerator.tokens[2]].map(x=>Number(x.slice(1))-1);
 const height='H'===multiplier.tokens[1]?2:-1;
 const ops={'+':(a,b)=>a+b,'×':(a,b)=>a*b};
 const sum=ops[numerator.tokens[1]],scale=ops[multiplier.tokens[0]];
 need(denominator.value===2&&height===2&&sum&&scale&&bases.join(',')==='0,1','INDOT_EXTRACTOR_FORMULA_INVALID');
 return {schema:'MANA_INTEGER_EXAMPLES_V1',id:ID,fields:FIELDS.map(id=>({id,power:1,max:MAX})),outputPower:2,
  examples:ANCHORS.map(row=>[[...row],scale(sum(row[bases[0]],row[bases[1]]),row[height])])};
}
async function discoverDirectPanelEvidence({pythonPath}={}) {
 need(isPythonPath(pythonPath),'INDOT_PYTHON_PATH_REQUIRED');
 const index=await fetchOfficial(INDEX_URL);
 const link=await inspectIndex(index.bytes,pythonPath);
 const source=await fetchOfficial(link.url);
 const info=await inspectPdf(source.bytes,pythonPath);
 const passage={pageIndex:info.pageIndex,printedPage:info.printedPage,
  sha256:info.pageTextSha256,structureSha256:digest(info.structure),proseSha256:info.proseSha256};
 return {status:'OFFICIAL_SOURCE_VERIFIED',sourceUrl:link.url,sourceSha256:PDF_SHA256,
  evidence:{publisher:'Indiana Department of Transportation',publication:TITLE,sourceMode:'direct',
   transport:'DIRECT_OFFICIAL_HTTPS',directRuntimeNetwork:true,captureRepresentation:'AUTHENTICATED_RAW_HTML_AND_PDF',
   scope:'Single pinned 2026 manual revision and ideal planar geometry; no design, pay quantity or installation claim.',
   index:{url:INDEX_URL,sha256:hash(index.bytes),byteCount:index.bytes.length,retrievedAt:index.retrievedAt},link,
   source:{url:link.url,sha256:PDF_SHA256,byteCount:PDF_BYTES,retrievedAt:source.retrievedAt},passage,
   extraction:{engine:'PyMuPDF',version:info.extractorVersion,structure:info.structure},
   output:{numerator:'twice_area',denominator:info.structure.denominator.value,unit:'mm²'},
   input:{unit:'mm',minimum:1,maximum:MAX,geometry:'positive parallel base lengths; perpendicular altitude; ideal planar panel'}},
  fit:makeFit(info)};
}
module.exports={discoverDirectPanelEvidence,PDF_SHA256,PDF_BYTES,inspectIndex,inspectPdf,fetchOfficial,INDOT_HTTPS_DEADLINE_MS};
