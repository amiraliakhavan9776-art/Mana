'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createDurableAuditLog}=require('../src/durable-audit.cjs');
function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-anchor-'));try{run(path.join(dir,'audit.jsonl'))}finally{fs.rmSync(dir,{recursive:true,force:true})}}
const event={actorId:'u',orgId:'o',action:'documents:read',outcome:'allowed',projectId:'p',requestId:'r',resourceId:'d'};
test('exclusive writer lock prevents concurrent chains and is released on close',()=>fixture(file=>{
 const log=createDurableAuditLog(file);
 assert.throws(()=>createDurableAuditLog(file),/EEXIST/);
 log.record(event);log.close();log.close();
 const next=createDurableAuditLog(file);assert.equal(next.list('o').length,1);next.close();
}));
test('independent checkpoint detects tail deletion and full valid-chain rewrite',()=>fixture(file=>{
 let checkpoint;const anchor={read:()=>checkpoint,write:value=>{checkpoint={...value}}};
 const log=createDurableAuditLog(file,{anchor});log.record(event);log.record({...event,requestId:'r2'});log.close();
 assert.equal(checkpoint.sequence,2);
 const raw=fs.readFileSync(file,'utf8');
 fs.writeFileSync(file,raw.split('\n')[0]+'\n');
 assert.throws(()=>createDurableAuditLog(file,{anchor}),/anchor mismatch/);
 fs.writeFileSync(file,'');
 assert.throws(()=>createDurableAuditLog(file,{anchor}),/anchor mismatch/);
 assert.equal(fs.existsSync(file+'.lock'),false);
}));
test('anchor outage poisons the writer until explicit reconciliation',()=>fixture(file=>{
 const anchor={read:()=>null,write:()=>{throw Error('anchor offline')}};
 const log=createDurableAuditLog(file,{anchor});
 assert.throws(()=>log.record(event),/anchor offline/);
 assert.throws(()=>log.record(event),/reconciliation/);log.close();
 assert.throws(()=>createDurableAuditLog(file,{anchor}),/requires trusted anchor/);
}));
test('audit round-trip retains correlation metadata and unique event identifiers',()=>fixture(file=>{
 const log=createDurableAuditLog(file);log.record({...event,approvalId:'approval1',idempotencyKey:'once',payloadDigest:'digest'});
 const first=log.list('o')[0];log.close();
 const next=createDurableAuditLog(file);const row=next.list('o')[0];
 assert.deepEqual(row,first);assert.equal(row.requestId,'r');assert.equal(row.approvalId,'approval1');
 assert.match(row.eventId,/^[0-9a-f-]{36}$/);assert.equal(next.list('other').length,0);next.close();
}));
test('disk write failure blocks subsequent appends until reconciliation',()=>fixture(file=>{
 const log=createDurableAuditLog(file),write=fs.writeSync;
 try {
  fs.writeSync=()=>{throw Error('disk full')};
  assert.throws(()=>log.record(event),/disk full/);
 } finally {fs.writeSync=write}
 assert.throws(()=>log.record(event),/reconciliation/);log.close();
}));
