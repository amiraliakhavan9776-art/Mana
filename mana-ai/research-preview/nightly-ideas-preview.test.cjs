'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {once}=require('node:events'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {startIdeasPreview,readCampaignEvidence}=require('./nightly-ideas-preview.cjs');
const TOKEN='ab'.repeat(32);
const master=process.env.MANA_IDEAS_TEST_MASTER;
function dirs(t,masterPath){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mana-ideas-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const parent=path.join(root,'immutable'),campaign=path.join(parent,'campaign'),workspace=path.join(parent,'native');
 for(const d of [parent,campaign,workspace])fs.mkdirSync(d,{mode:0o700});
 return {parent,campaign,workspace,masterPath:masterPath??path.join(root,'missing-master.txt')};
}
function state(root){
 const list={};
 function scan(d){
  for(const n of fs.readdirSync(d).sort()){
   const p=path.join(d,n),st=fs.lstatSync(p);
   list[path.relative(root,p)]=[st.mode,st.ino,st.mtimeMs,st.isFile()?createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null];
   if(st.isDirectory())scan(p);
  }
 }
 scan(root);return list;
}
async function open(t,config){
 const server=startIdeasPreview({...config,token:TOKEN});
 await once(server,'listening');
 assert.equal(server.address().address,'127.0.0.1');
 t.after(()=>{if(server.listening)return new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));});
 return server;
}
const authorization='Basic '+Buffer.from('mana:'+TOKEN).toString('base64');
function get(server,{location='/',method='GET',token=authorization,headers={}}={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:location,method,
   headers:{...(token?{Authorization:token}:{}),...headers}},res=>{
   const data=[];res.on('data',b=>data.push(b));res.on('error',reject);
   res.on('end',()=>resolve({code:res.statusCode,headers:res.headers,text:Buffer.concat(data).toString('utf8')}));
  });
  req.on('error',reject);req.end();
 });
}
function op(t,args,operation){
 const r=spawnSync(process.execPath,[path.resolve(__dirname,'../run-rd-nightly-tick.cjs'),operation,
  args.campaign,args.workspace,args.masterPath],{timeout:20000,encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+' '+r.stderr);return JSON.parse(r.stdout);
}
test('requires operator credential and literal loopback Host; no API or mutation surface',async t=>{
 assert.throws(()=>startIdeasPreview({token:'short'}),/INVALID_CONFIGURATION/);
 const conf=dirs(t),baseline=state(conf.parent),server=await open(t,conf);
 for(const token of [null,'Basic nO+auTH',authorization.replace(/.$/u,'Z')]){
  const r=await get(server,{token});
  assert.equal(r.code,401);
  assert.equal(r.headers['cache-control'],'no-store');
  assert.match(r.headers['www-authenticate'],/^Basic /);
  assert.doesNotMatch(r.text,/رسید|پنل.*ایده|مأموریت|immutable/);
 }
 for(const headers of [{Host:'elsewhere.invalid'},{Origin:'https://elsewhere.invalid'},{'Sec-Fetch-Site':'cross-site'}])
  assert.equal((await get(server,{headers})).code,403);
 assert.equal((await get(server,{location:'/?init=true'})).code,404);
 assert.equal((await get(server,{location:'/run'})).code,404);
 assert.equal((await get(server,{method:'POST'})).code,405);
 assert.deepEqual(state(conf.parent),baseline);
});
test('missing state is a labeled no-idea page without initialization, path leaks or inline scripts',async t=>{
 const conf=dirs(t),baseline=state(conf.parent),server=await open(t,conf);
 assert.throws(()=>readCampaignEvidence(conf));
 const r=await get(server);
 assert.equal(r.code,503);
 assert.match(r.text,/lang="fa" dir="rtl"/);
 assert.match(r.text,/مدرک کامل تأیید نشد/);
 assert.doesNotMatch(r.text,/آزمون تازه اضافه شود|<script|missing-master|immutable|http/);
 assert.match(r.headers['content-security-policy'],/default-src 'none'/);
 assert.equal(r.headers['x-frame-options'],'DENY');
 assert.deepEqual(state(conf.parent),baseline);
});
test('real CPU campaign: authenticated Persian idea is reproducible after reload/restart and corruption withholds it', {skip:!master},async t=>{
 const conf=dirs(t,master),first=await open(t,conf);
 assert.equal((await get(first)).code,503);
 // This test, not the HTTP preview, runs the explicitly selected local campaign.
 assert.equal(op(t,conf,'init').status,'INITIALIZED');
 assert.equal(op(t,conf,'tick').status,'CASE_VERIFIED');
 assert.equal((await get(first)).code,503);
 assert.equal(op(t,conf,'tick').status,'CASE_VERIFIED');
 const original=state(conf.parent),expected=readCampaignEvidence(conf),initial=await get(first);
 assert.equal(initial.code,200);
 assert.equal((await get(first,{token:null})).code,401);
 assert.match(initial.text,/آزمون تازه اضافه شود/);
 assert.match(initial.text,/بخش ۶٫۴/);
 assert.match(initial.text,/بخش ۶٫۶/);
 assert.match(initial.text,/هنوز مقایسه یا بهبود تازه‌ای اندازه‌گیری نشده/);
 assert.match(initial.text,/فقط برای بازبینی انسانی/);
 assert.match(initial.text,/آزمون بعدی پیشنهادی/);
 assert.match(initial.text,new RegExp(expected,'u'));
 assert.doesNotMatch(initial.text,/<script|<form|https?:|immutable/u);
 assert.equal((await get(first)).text,initial.text);
 await new Promise((resolve,reject)=>first.close(err=>err?reject(err):resolve()));
 const second=await open(t,conf);
 assert.equal((await get(second)).text,initial.text);
 assert.deepEqual(state(conf.parent),original);
 const tampered=path.join(conf.campaign,'attempt-2.result.json');
 const raw=JSON.parse(fs.readFileSync(tampered,'utf8'));
 fs.writeFileSync(tampered,JSON.stringify({...raw,digest:'7'.repeat(64)})+'\n');
 const altered=state(conf.parent),after=await get(second);
 assert.equal(after.code,503);
 assert.doesNotMatch(after.text,new RegExp(expected,'u'));
 assert.deepEqual(state(conf.parent),altered);
});
