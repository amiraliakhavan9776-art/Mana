'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compareLegacySnapshots:compare}=require('../src/legacy-reconciliation.cjs');
const {createLegacyBackup,verifyLegacyBackup}=require('../src/legacy-backup.cjs');
function fixture(){return {databaseJson:JSON.stringify({meta:{v:2},settings:{currency:'IRR'},projects:[{id:'p'},{id:'q'}],contracts:[{id:'c',projectId:'p'}],invoices:[{id:'a',projectId:'p',contractId:'c',amount:'9007199254740993.01',status:'approved',approvedBy:'سیستم'},{id:'b',projectId:'p',amount:'100.00'}],futureRecords:[]}),attachments:[{id:'f',ownerKey:'project:p',data:'data:text/plain;base64,YQ=='}]};}
function mutate(input,fn){const db=JSON.parse(input.databaseJson);fn(db);return {...input,databaseJson:JSON.stringify(db)};}
test('lossless restore tolerates object and collection order but preserves exact values and provenance',()=>{
 const a=fixture(),original=JSON.stringify(a),b=mutate(a,db=>db.invoices.reverse());
 const r=compare(a,b);assert.equal(r.passed,true);assert.deepEqual(r.before.unverifiedInvoiceIds,['a','b']);assert.equal(JSON.stringify(a),original);
});
test('balanced transfers between records and sub-cent large-value changes cannot hide in aggregate totals',()=>{
 const a=fixture(),b=mutate(a,db=>{db.invoices[0].amount='9007199254740994.01';db.invoices[1].amount='99.00';});
 const r=compare(a,b);assert.equal(r.passed,false);assert.deepEqual(r.differences.map(x=>x.id),['a','b']);
 assert.equal(compare(a,mutate(a,db=>db.invoices[0].amount='9007199254740993.02')).passed,false);
});
test('missing empty collections, IDs, approval provenance and settings changes fail',()=>{
 const a=fixture();
 for(const fn of [db=>delete db.futureRecords,db=>db.invoices.pop(),db=>db.invoices[0].approvedBy='operator',db=>db.settings.currency='تومان'])assert.equal(compare(a,mutate(a,fn)).passed,false);
});
test('matching corrupt cross-project or orphan relationships never count as a successful restore',()=>{
 for(const fn of [db=>db.invoices[0].projectId='q',db=>db.invoices[0].projectId='absent',db=>db.invoices[0].contractId='absent']){
  const a=mutate(fixture(),fn);const r=compare(a,a);assert.equal(r.passed,false);assert.ok(r.before.issues.length);
 }
});
test('attachment content, owner and missing attachment changes fail without exposing data in report',()=>{
 const a=fixture();
 for(const attachments of [[],[{...a.attachments[0],ownerKey:'project:q'}],[{...a.attachments[0],data:'data:text/plain;base64,Yg=='}]])assert.equal(compare(a,{...a,attachments}).passed,false);
 const r=compare(a,{...a,attachments:[]});assert.ok(!JSON.stringify(r).includes('data:text'));
});
test('malformed schema, duplicate IDs, missing attachments and unsupported schema fail closed',()=>{
 const a=fixture();
 for(const bad of [{...a,databaseJson:'{'},{...a,attachments:undefined},mutate(a,db=>db.meta.v=3),mutate(a,db=>db.projects.push(db.projects[0])),{...a,attachments:[...a.attachments,...a.attachments]}])assert.throws(()=>compare(a,bad));
});
test('unsafe JSON numbers cannot disappear through IEEE-754 rounding',()=>{
 const a=fixture();
 for(const amount of [9007199254740992,0.1,Infinity]){
  if(Number.isFinite(amount))assert.throws(()=>compare(a,mutate(a,db=>db.invoices[0].amount=amount)),/Unsafe numeric/);
 }
});
test('duplicate escaped keys and rounded decimal lexemes are refused before normalization',()=>{
 const a=fixture();
 for(const json of ['{"id":"a","id":"b"}','{"id":"a","\\u0069d":"b"}']){
  const bad={...a,databaseJson:a.databaseJson.replace('"futureRecords":[]','"futureRecords":['+json+']')};
  assert.throws(()=>compare(a,bad),/Duplicate JSON key/);
 }
 const bad={...a,databaseJson:a.databaseJson.replace('"100.00"','1.00000000000000001')};assert.throws(()=>compare(a,bad),/Unsafe numeric/);
});
test('real encrypted backup round-trip is reconciled against the original exported snapshot',()=>{
 const source=fixture(),key=Buffer.alloc(32,17),restored=verifyLegacyBackup(createLegacyBackup(source,key),key);
 assert.equal(compare(source,restored).passed,true);
});
test('CLI distinguishes equality, drift and invalid input without mutating snapshot files',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-reconcile-'));
 try{
  const a=path.join(dir,'a.json'),b=path.join(dir,'b.json'),source=JSON.stringify(fixture());
  fs.writeFileSync(a,source);fs.writeFileSync(b,source);
  const run=()=>spawnSync(process.execPath,[path.join(__dirname,'../../tools/reconcile-legacy.cjs'),a,b],{encoding:'utf8'});
  assert.equal(run().status,0);
  fs.writeFileSync(b,JSON.stringify(mutate(fixture(),db=>db.invoices[0].amount='0')));const drift=run();assert.equal(drift.status,2);assert.equal(JSON.parse(drift.stdout).passed,false);
  fs.writeFileSync(b,'private-malformed-input');const invalid=run();assert.equal(invalid.status,1);assert.equal(invalid.stdout,'');assert.ok(!invalid.stderr.includes('private-malformed-input'));assert.equal(fs.readFileSync(a,'utf8'),source);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
