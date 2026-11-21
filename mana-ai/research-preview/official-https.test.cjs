'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const https=require('node:https');
const {readOfficial}=require('./official-https.cjs');
test('publisher fetch never issues arbitrary paths, uses TLS fixed origin, refuses redirects and oversized bodies',async t=>{
 let n=0, reply;
 const restore=t.mock.method(https,'get',(options,callback)=>{
  n++;
  assert.equal(options.protocol,'https:');
  assert.equal(options.hostname,'raw.githubusercontent.com');
  assert.equal(options.port,443);
  assert.equal(options.path,'/python/cpython/6cb20a219a860eaf687b2d968b41c480c7461909/Doc/library/index.rst');
  assert.equal(options.agent,false);
  const res=new EventEmitter();res.headers={'content-type':'text/plain'};res.destroy=()=>{};
  queueMicrotask(()=>{res.statusCode=reply.status;callback(res);if(reply.status===200){res.emit('data',reply.data);res.emit('end');}});
  return new EventEmitter();
 });
 try{
  for(const path of ['../math.rst','Doc/library/index.rst?x=1','https://example.com/index.rst','__proto__'])await assert.rejects(readOfficial(path),/SOURCE_PATH_REJECTED/);
  assert.equal(n,0);
  reply={status:302};await assert.rejects(readOfficial('Doc/library/index.rst'),/OFFICIAL_DOCUMENT_NOT_AVAILABLE/);assert.equal(n,1);
  reply={status:200,data:Buffer.alloc(65537)};await assert.rejects(readOfficial('Doc/library/index.rst'),/OFFICIAL_DOCUMENT_LIMIT/);assert.equal(n,2);
  reply={status:200,data:Buffer.from('boundary fixture')};const r=await readOfficial('Doc/library/index.rst');
  assert.equal(Buffer.from(r.contentBase64,'base64').toString(),'boundary fixture');assert.equal(n,3);
 }finally{restore.mock.restore();}
});
