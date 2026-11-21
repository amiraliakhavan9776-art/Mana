'use strict';
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {INDEX_URL}=require('./aec-source.cjs');
const {fetchOfficial,inspectIndex,inspectPdf,INDOT_HTTPS_DEADLINE_MS}=require('./indot-direct.cjs');

const SCHEMA='MANA_INDOT_DIAGNOSTIC_V1';
const SAFE_FAULTS=new Set([
 'INDOT_PYTHON_PATH_REQUIRED',
 'INDOT_HTTPS_TIMEOUT','INDOT_HTTPS_REQUEST_FAILED','INDOT_HTTPS_STATUS_REJECTED',
 'INDOT_HTTPS_MEDIA_REJECTED','INDOT_HTTPS_BODY_REJECTED','INDOT_HTTPS_INCOMPLETE',
 'INDOT_INDEX_BYTES_REJECTED','INDOT_LINK_NOT_APPROVED','INDOT_LINK_MISSING_OR_AMBIGUOUS',
 'INDOT_PDF_REVISION_MISMATCH','INDOT_PYMUPDF_REQUIRED','INDOT_EXTRACTOR_TIMEOUT',
 'INDOT_EXTRACTOR_START_FAILED','INDOT_EXTRACTOR_FAILED','INDOT_EXTRACTOR_OUTPUT_INVALID',
 'INDOT_EXTRACTOR_FORMULA_INVALID','INDOT_EXTRACTOR_OUTPUT_LIMIT',
 'INDOT_PDF_FRACTION_LAYOUT_MISMATCH','INDOT_PDF_PROSE_MISMATCH',
]);
const validPython=p=>typeof p==='string'&&p.length<4096&&!p.includes('\0')&&path.isAbsolute(p)&&path.resolve(p)===p;
const faultFor=e=>SAFE_FAULTS.has(e?.message)?e.message:'INDOT_DIAGNOSTIC_UNVERIFIED';

async function diagnoseIndot({pythonPath,request}={}){
 const stages=[];
 const result=(status,fault)=>({schema:SCHEMA,status,perRequestDeadlineMs:INDOT_HTTPS_DEADLINE_MS,stages,fault});
 if(!validPython(pythonPath))return result('BLOCKED','INDOT_PYTHON_PATH_REQUIRED');
 async function stage(stage,url,verify){
  let network;
  const start=performance.now();
  let capture, verified, fault=null;
  try{
   capture=await fetchOfficial(url,request,metrics=>{network=metrics;});
  }catch(e){fault=faultFor(e);}
  const timing=network??{elapsedMs:Math.round(performance.now()-start),headersMs:null,firstBodyByteMs:null,bytesReceived:0};
  if(capture){
   try{verified=await verify(capture.bytes,pythonPath);}
   catch(e){fault=faultFor(e);}
  }
  stages.push({stage,outcome:fault===null?'VERIFIED':'BLOCKED',elapsedMs:timing.elapsedMs,headersMs:timing.headersMs,
   firstBodyByteMs:timing.firstBodyByteMs,bytesReceived:timing.bytesReceived,fault});
  return {verified,fault};
 }
 const index=await stage('index',INDEX_URL,inspectIndex);
 if(index.fault!==null)return result('BLOCKED',index.fault);
 const pdf=await stage('pdf',index.verified.url,inspectPdf);
 return pdf.fault===null?result('SOURCE_VERIFIED',null):result('BLOCKED',pdf.fault);
}

if(require.main===module){
 const [pythonPath,...rest]=process.argv.slice(2);
 diagnoseIndot({pythonPath:rest.length?undefined:pythonPath}).then(report=>{
  process.stdout.write(JSON.stringify(report)+'\n');
  if(report.status!=='SOURCE_VERIFIED')process.exitCode=1;
 },()=>{
  const fault='INDOT_DIAGNOSTIC_UNVERIFIED';
  process.stdout.write(JSON.stringify({schema:SCHEMA,status:'BLOCKED',perRequestDeadlineMs:INDOT_HTTPS_DEADLINE_MS,stages:[],fault})+'\n');
  process.exitCode=1;
 });
}
module.exports={diagnoseIndot};
