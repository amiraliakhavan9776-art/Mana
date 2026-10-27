'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createFileAuditAnchor,loadAuditAnchor}=require('../src/file-audit-anchor.cjs');
const {createDurableAuditLog}=require('../src/durable-audit.cjs');
function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-witness-'));try{run(dir)}finally{fs.rmSync(dir,{recursive:true,force:true})}}
test('persistent encrypted checkpoint detects truncation across process-independent instances',()=>fixture(dir=>{
 const file=path.join(dir,'anchor.enc'),audit=path.join(dir,'audit.jsonl'),key=Buffer.alloc(32,4);
 const open=()=>createFileAuditAnchor({file,key,auditId:'audit1'});
 const log=createDurableAuditLog(audit,{anchor:open()});log.record({action:'read',outcome:'allowed'});log.close();
 const recovered=createDurableAuditLog(audit,{anchor:open()});assert.equal(recovered.checkpoint().sequence,1);recovered.close();
 fs.writeFileSync(audit,'');assert.throws(()=>createDurableAuditLog(audit,{anchor:open()}),/anchor mismatch/);
}));
test('checkpoint enforces audit identity, correct key, sequential writes and ciphertext integrity',()=>fixture(dir=>{
 const file=path.join(dir,'anchor.enc'),key=Buffer.alloc(32,4),anchor=createFileAuditAnchor({file,key,auditId:'one'});
 anchor.write({sequence:1,hash:'a'.repeat(64)});
 assert.throws(()=>anchor.write({sequence:1,hash:'b'.repeat(64)}),/sequence/);
 assert.throws(()=>anchor.write({sequence:3,hash:'b'.repeat(64)}),/sequence/);
 assert.throws(()=>createFileAuditAnchor({file,key,auditId:'other'}).read());
 assert.throws(()=>createFileAuditAnchor({file,key:Buffer.alloc(32,5),auditId:'one'}).read());
 const bytes=fs.readFileSync(file);bytes[30]^=1;fs.writeFileSync(file,bytes);assert.throws(()=>anchor.read());
}));
test('startup adapter requires separate paths and private real key files',()=>fixture(dir=>{
 const logs=path.join(dir,'logs'),evidence=path.join(dir,'evidence');fs.mkdirSync(logs);fs.mkdirSync(evidence);
 const auditFile=path.join(logs,'audit.jsonl'),anchorFile=path.join(evidence,'anchor.enc'),keyFile=path.join(evidence,'key');
 fs.writeFileSync(keyFile,Buffer.alloc(32,6),{mode:0o600});
 const anchor=loadAuditAnchor({auditFile,anchorFile,keyFile});assert.equal(anchor.read(),null);
 assert.throws(()=>loadAuditAnchor({auditFile,anchorFile:path.join(logs,'anchor.enc'),keyFile}),/separate/);
 fs.chmodSync(keyFile,0o644);assert.throws(()=>loadAuditAnchor({auditFile,anchorFile,keyFile}),/Private/);
}));
test('failed service startup releases the durable audit writer lock',()=>fixture(dir=>{
 const {spawnSync}=require('node:child_process'),auditFile=path.join(dir,'audit.jsonl');
 const modulePath=path.join(__dirname,'../src/server.cjs');
 const script='try {require('+JSON.stringify(modulePath)+').start();process.exit(2)} catch(e) {if(!/MANA_AI_TOKEN/.test(e.message))throw e}';
 const child=spawnSync(process.execPath,['-e',script],{env:{PATH:process.env.PATH,MANA_AI_TOKEN:'short',MANA_AI_AUDIT_FILE:auditFile},encoding:'utf8',timeout:5000});
 assert.equal(child.status,0,child.stderr);
 assert.equal(fs.existsSync(auditFile+'.lock'),false);
}));
