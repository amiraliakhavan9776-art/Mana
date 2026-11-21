'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {inspectIndex,inspectPdf,fetchOfficial,discoverDirectPanelEvidence,PDF_SHA256,PDF_BYTES}=require('./indot-direct.cjs');
const {INDEX_URL,SOURCE_URL}=require('./aec-source.cjs');
const href=new URL(SOURCE_URL).pathname+new URL(SOURCE_URL).search;
const html=('<h2>Certified Technician Program Manuals</h2><p><a href="'+href+'"><strong>2026 Construction Procedures I</strong></a></p>'
 +'<p><a href="/elsewhere">2026 Construction Procedures II</a></p><h3>Contact Information</h3>');
const python=process.env.MANA_INDOT_PYTHON||'/usr/bin/python3';
const raw=process.env.MANA_INDOT_RAW_FIXTURES;
test('finds only the single actual scoped relative anchor',async()=>{
 const result=await inspectIndex(Buffer.from(html),python);
 assert.equal(result.href,href);assert.equal(result.url,SOURCE_URL);assert.equal(result.indexLine,1);
 assert.match(result.sha256,/^[a-f0-9]{64}$/);
 for(const text of [
  html.replace('Certified Technician Program Manuals','Other heading'),
  html.replace(href,'https://example.org/source.pdf'),
  html.replace(href,'//www.in.gov'+href),
  html.replace('href="'+href+'"','href="'+href+'" href="/hidden"'),
  html.replace('<h3>', '<a href="'+href+'">2026 Construction Procedures I</a><h3>'),
 ]){
  await assert.rejects(inspectIndex(Buffer.from(text),python),/INDOT_LINK_/);
 }
});
test('unapproved acquisition and missing trusted interpreter fail before dispatch',async()=>{
 await assert.rejects(fetchOfficial('https://example.org/'),/INDOT_URL_NOT_APPROVED/);
 await assert.rejects(discoverDirectPanelEvidence(),/INDOT_PYTHON_PATH_REQUIRED/);
});
function mocked({status=200,headers={'content-type':'text/html','content-length':'2'},chunks=[Buffer.from('ok')],complete=true}={}){
 const calls=[];
 const request=(url,options,callback)=>{
  const res=new EventEmitter();Object.assign(res,{statusCode:status,headers,complete});
  const req=new EventEmitter();req.destroy=()=>{};
  req.end=()=>queueMicrotask(()=>{
   callback(res);for(const c of chunks)res.emit('data',c);res.emit('end');
  });
  calls.push({url,options});
  return req;
 };
 return {request,calls};
}
test('uses authenticated exact GET and never follows a redirect',async()=>{
 const good=mocked(),value=await fetchOfficial(INDEX_URL,good.request);
 assert.equal(value.bytes.toString(),'ok');
 const [{url,options}]=good.calls;
 assert.equal(url,INDEX_URL);assert.equal(options.method,'GET');
 assert.equal(options.rejectUnauthorized,true);
 assert.equal(options.headers['Accept-Encoding'],'identity');
 const redirect=mocked({status:302,headers:{location:SOURCE_URL}});
 await assert.rejects(fetchOfficial(INDEX_URL,redirect.request),/INDOT_HTTPS_STATUS_REJECTED/);
 assert.equal(redirect.calls.length,1);
});
test('nonmatching MIME, compressed body, size, and incomplete stream are rejected',async()=>{
 for(const [response,code] of [
  [{headers:{'content-type':'application/pdf'}},'INDOT_HTTPS_MEDIA_REJECTED'],
  [{headers:{'content-type':'text/html','content-encoding':'gzip'}},'INDOT_HTTPS_MEDIA_REJECTED'],
  [{headers:{'content-type':'text/html','content-length':'1048577'}},'INDOT_HTTPS_BODY_REJECTED'],
  [{headers:{'content-type':'text/html'},chunks:[Buffer.alloc(1048577)]},'INDOT_HTTPS_BODY_REJECTED'],
  [{complete:false},'INDOT_HTTPS_INCOMPLETE'],
 ]) await assert.rejects(fetchOfficial(INDEX_URL,mocked(response).request),new RegExp(code));
});
test('fails closed on a PDF revision before asking the extractor to read it',async()=>{
 await assert.rejects(inspectPdf(Buffer.alloc(PDF_BYTES),'/does/not/exist'),/INDOT_PDF_REVISION_MISMATCH/);
});
test('actual public source raw bytes: direct extraction checks fraction and accompanying prose',{skip:!raw},async()=>{
 const index=await inspectIndex(fs.readFileSync(path.join(raw,'index.html')),python);
 const document=await inspectPdf(fs.readFileSync(path.join(raw,'indot.pdf')),python);
 assert.equal(index.url,SOURCE_URL);
 assert.equal(document.pdfSha256,PDF_SHA256);
 assert.equal(document.pageIndex,12);assert.equal(document.printedPage,'1-3');
 assert.deepEqual(document.structure.numerator.tokens,['B1','+','B2']);
 assert.equal(document.structure.denominator.value,2);
 assert.deepEqual(document.structure.multiplier.tokens,['×','H']);
 assert.ok(document.structure.numerator.box[3]<document.structure.denominator.box[1]);
 assert.match(document.proseSha256,/^[a-f0-9]{64}$/);
 const changed=fs.readFileSync(path.join(raw,'indot.pdf'));changed[440]^=1;
 await assert.rejects(inspectPdf(changed,python),/INDOT_PDF_REVISION_MISMATCH/);
});
