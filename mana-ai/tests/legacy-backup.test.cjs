'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLegacyBackup,verifyLegacyBackup}=require('../src/legacy-backup.cjs');
const key=Buffer.alloc(32,7);
const db={meta:{v:2},settings:{currency:'تومان'},projects:[{id:'p',name:'آزمایش'}],contracts:[{id:'c',projectId:'p',amount:1000001}],invoices:[{id:'i',projectId:'p',contractId:'c',status:'approved',approvedBy:'سیستم',items:[{qty:2,price:500}]}],customFields:[]};
const attachments=[{id:'a',ownerKey:'project:p',name:'آزمایش.txt',data:'data:text/plain;base64,aGVsbG8='}];
const pack=(data=db)=>({databaseJson:JSON.stringify(data,null,2),attachments});
test('encrypted backup restores exact raw database and IndexedDB attachment records without promoting approvals',()=>{
 const input=pack(),before=JSON.stringify(input),bytes=createLegacyBackup(input,key);
 assert.equal(bytes.includes(Buffer.from('آزمایش')),false);
 const restored=verifyLegacyBackup(bytes,key);
 assert.equal(restored.databaseJson,input.databaseJson);
 assert.deepEqual(restored.attachments,attachments);
 assert.deepEqual(restored.report.unverifiedInvoiceIds,['i']);
 assert.deepEqual(restored.report.counts,{projects:1,contracts:1,invoices:1,customFields:0});
 assert.equal(JSON.stringify(input),before);
 assert.equal(JSON.parse(restored.databaseJson).invoices[0].status,'approved');
});
test('wrong keys, modified bytes and truncation cannot restore',()=>{
 const bytes=createLegacyBackup(pack(),key),changed=Buffer.from(bytes);changed[changed.length-1]^=1;
 for(const b of [changed,bytes.subarray(0,bytes.length-1)])assert.throws(()=>verifyLegacyBackup(b,key));
 assert.throws(()=>verifyLegacyBackup(bytes,Buffer.alloc(32,8)));
 assert.notDeepEqual(createLegacyBackup(pack(),key),bytes);
});
test('corrupt exports, unknown schemas, duplicate IDs and orphan relations fail instead of seeding',()=>{
 for(const value of ['{','{}',JSON.stringify({...db,meta:{v:3}})])assert.throws(()=>createLegacyBackup({databaseJson:value,attachments:[]},key));
 assert.throws(()=>createLegacyBackup(pack({...db,projects:[db.projects[0],db.projects[0]]}),key),/duplicate/);
 assert.throws(()=>createLegacyBackup(pack({...db,invoices:[{id:'i',projectId:'missing'}]}),key),/Orphan/);
 assert.throws(()=>createLegacyBackup(pack({...db,invoices:[{id:'i',contractId:'missing'}]}),key),/Orphan/);
});
test('attachments must be explicitly supplied and backup never discards unknown collections',()=>{
 assert.throws(()=>createLegacyBackup({databaseJson:JSON.stringify(db)},key),/attachment/);
 const input=pack({...db,futureRecords:[{id:'future',value:'preserve'}]});
 assert.equal(verifyLegacyBackup(createLegacyBackup(input,key),key).databaseJson,input.databaseJson);
 assert.throws(()=>createLegacyBackup({...pack(),attachments:[...attachments,...attachments]},key),/attachment/);
});
