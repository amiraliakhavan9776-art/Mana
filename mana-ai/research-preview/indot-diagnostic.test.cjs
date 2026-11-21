'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {INDEX_URL,SOURCE_URL}=require('./aec-source.cjs');
const {diagnoseIndot}=require('./indot-diagnostic.cjs');
const pythonPath=process.env.MANA_INDOT_PYTHON??'/usr/bin/python3';
const href=new URL(SOURCE_URL).pathname+new URL(SOURCE_URL).search;
const index=Buffer.from('<h2>Certified Technician Program Manuals</h2><a href="'+href+'">2026 Construction Procedures I</a>');
function transport(trace,{
 indexBytes=index,haltIndex=false,partialPdf=false,throwIndex=false,
}={}){
 return (url,options,onResponse)=>{
  assert([INDEX_URL,SOURCE_URL].includes(url));
  assert.equal(options.rejectUnauthorized,true);
  assert.equal(options.method,'GET');
  trace.push(url);
  const req=new EventEmitter();
  req.destroy=()=>{};
  req.end=()=>queueMicrotask(()=>{
   if(url===INDEX_URL&&throwIndex){req.emit('error',Error('INTERNAL DATA THAT MUST NOT APPEAR'));return;}
   if(url===INDEX_URL&&haltIndex)return;
   const body=url===INDEX_URL?indexBytes:Buffer.from('%PDF-');
   const response=new EventEmitter();
   Object.assign(response,{statusCode:200,complete:true,headers:{'content-type':url===INDEX_URL?'text/html':'application/pdf'}});
   onResponse(response);
   response.emit('data',body);
   if(url===SOURCE_URL&&partialPdf)return;
   response.emit('end');
  });
  return req;
 };
}
function shortenDeadline(t){
 const set=global.setTimeout;
 t.mock.method(global,'setTimeout',(f,ms,...args)=>set(f,ms===15000?20:ms,...args));
}
test('publisher timeout before headers stops at index without a PDF request',async t=>{
 shortenDeadline(t);
 const trace=[];
 const report=await diagnoseIndot({pythonPath,request:transport(trace,{haltIndex:true})});
 assert.deepEqual(trace,[INDEX_URL]);assert.equal(report.stages.length,1);
 assert.equal(report.status,'BLOCKED');assert.equal(report.perRequestDeadlineMs,15000);
 const [stage]=report.stages;
 assert.equal(stage.stage,'index');assert.equal(stage.fault,'INDOT_HTTPS_TIMEOUT');
 assert.equal(stage.headersMs,null);assert.equal(stage.firstBodyByteMs,null);assert.equal(stage.bytesReceived,0);
 assert(Number.isInteger(stage.elapsedMs)&&stage.elapsedMs>=0);
});
test('distinguishes PDF body stall from first response delay, by following only the verified link',async t=>{
 shortenDeadline(t);
 const trace=[];
 const report=await diagnoseIndot({pythonPath,request:transport(trace,{partialPdf:true})});
 assert.deepEqual(trace,[INDEX_URL,SOURCE_URL]);
 const [html,pdf]=report.stages;
 assert.equal(html.stage,'index');assert.equal(html.outcome,'VERIFIED');assert.equal(html.fault,null);assert.equal(html.bytesReceived,index.length);
 assert.equal(pdf.stage,'pdf');assert.equal(pdf.fault,'INDOT_HTTPS_TIMEOUT');assert.equal(pdf.bytesReceived,5);
 assert(Number.isInteger(pdf.headersMs)&&pdf.headersMs>=0);
 assert(Number.isInteger(pdf.firstBodyByteMs)&&pdf.headersMs<=pdf.firstBodyByteMs&&pdf.firstBodyByteMs<=pdf.elapsedMs);
 assert(!JSON.stringify(report).includes('%PDF-'));
});
test('rejects unapproved link and sanitized transport error without following another origin',async()=>{
 for(const options of [{indexBytes:Buffer.from(index.toString().replace(href,'https://example.org/'))},{throwIndex:true}]){
  const trace=[];
  const report=await diagnoseIndot({pythonPath,request:transport(trace,options)});
  assert.deepEqual(trace,[INDEX_URL]);
  const asJson=JSON.stringify(report);
  assert(!/example\.org|INTERNAL DATA|<h2>/.test(asJson));
 }
});
test('transfer completion is not verification when the PDF digest is wrong',async()=>{
 const trace=[];
 const report=await diagnoseIndot({pythonPath,request:transport(trace)});
 assert.deepEqual(trace,[INDEX_URL,SOURCE_URL]);
 assert(/INDOT_PDF_REVISION_MISMATCH/.test(JSON.stringify(report)));
 assert(!JSON.stringify(report).includes('%PDF-'));
});

test('CLI emits a single safe JSON report and refuses unexpected arguments before any request',()=>{
 const p=spawnSync(process.execPath,[path.join(__dirname,'indot-diagnostic.cjs'),pythonPath,'unapproved-extra-argument'],{encoding:'utf8',timeout:1000});
 assert.equal(p.stderr,'');assert.equal(p.status,1);
 assert.equal(p.stdout.trim().split('\n').length,1);
 const report=JSON.parse(p.stdout);
 assert.equal(report.status,'BLOCKED');assert.equal(report.fault,'INDOT_PYTHON_PATH_REQUIRED');assert.deepEqual(report.stages,[]);
});
