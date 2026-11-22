'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{EventEmitter}=require('node:events');
const {capturePinnedArea}=require('./nasa-area-capture.cjs');
const {INDEX_URL,AREA_URL}=require('./nasa-area-source.cjs');
const pythonPath=process.env.MANA_NASA_PYTHON??'/usr/bin/python3';
const hasPython=spawnSync(pythonPath,['--version'],{timeout:1000}).status===0;
const CUE='RAW_PUBLIC_PAGE_TEXT_MUST_NOT_BE_LOGGED';
const index=href=>'<html><head><title>Index of Aerodynamics Slides</title></head><body><img alt="Label for Math Fundamentals"><a href="'+href+'">Area</a></body></html>';
function mock(calls,idx,area){
 return (url,opts,callback)=>{
  assert.equal(opts.rejectUnauthorized,true);assert.equal(opts.method,'GET');
  calls.push(url);
  const req=new EventEmitter();req.destroy=()=>{};
  req.end=()=>setImmediate(()=>{
   const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'text/html'};res.complete=true;
   callback(res);res.emit('data',Buffer.from(url===INDEX_URL?idx:area));res.emit('end');
  });
  return req;
 };
}
function privateDir(t){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'mana-nasa-capture-test-'));
 t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 return d;
}
test('capture follows only the scoped index and pinned lesson bytes; mismatch never writes or leaks text',{skip:!hasPython},async t=>{
 const outputDir=privateDir(t),calls=[];
 const result=await capturePinnedArea({pythonPath,outputDir,request:mock(calls,index('area.html'),CUE)});
 assert.deepEqual(calls,[INDEX_URL,AREA_URL]);
 assert.equal(result.status,'CAPTURE_BLOCKED');
 assert.equal(result.fault,'NASA_CAPTURE_LESSON_REVISION_MISMATCH');
 assert.deepEqual(fs.readdirSync(outputDir),[]);
 assert(!JSON.stringify(result).includes(CUE));
});
test('unapproved Area link never fetches a second URL and cannot create an artifact',{skip:!hasPython},async t=>{
 const outputDir=privateDir(t),calls=[];
 const result=await capturePinnedArea({pythonPath,outputDir,request:mock(calls,index('https://example.invalid/area.html'),CUE)});
 assert.equal(result.fault,'NASA_CAPTURE_LINK_OR_TRANSPORT_UNVERIFIED');
 assert.deepEqual(calls,[INDEX_URL]);assert.deepEqual(fs.readdirSync(outputDir),[]);
});
test('nonempty, permissive or noncanonical output directory blocks before any request',async t=>{
 const outputDir=privateDir(t),request=()=>assert.fail('no network on bad output');
 fs.writeFileSync(path.join(outputDir,'existing.txt'),'do not replace');
 let result=await capturePinnedArea({pythonPath,outputDir,request});
 assert.equal(result.fault,'NASA_CAPTURE_PRIVATE_EMPTY_DIRECTORY_REQUIRED');
 assert.deepEqual(fs.readdirSync(outputDir),['existing.txt']);
 fs.unlinkSync(path.join(outputDir,'existing.txt'));fs.chmodSync(outputDir,0o755);
 result=await capturePinnedArea({pythonPath,outputDir,request});
 assert.equal(result.fault,'NASA_CAPTURE_PRIVATE_EMPTY_DIRECTORY_REQUIRED');
});
