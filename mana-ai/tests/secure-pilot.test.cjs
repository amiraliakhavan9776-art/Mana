'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {loadPilotConfig}=require('../secure-pilot.cjs');
test('secure pilot rejects incomplete configuration',()=>{
 assert.throws(()=>loadPilotConfig({}),/Missing required/);
});
test('secure pilot reads local account and key files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-pilot-'));
 try{
  const accounts=path.join(dir,'accounts.json'),key=path.join(dir,'key.bin');
  fs.writeFileSync(accounts,JSON.stringify([{userId:'alice',organizationId:'org1',salt:'0'.repeat(32),digest:'0'.repeat(64)}]));
  fs.writeFileSync(key,Buffer.alloc(32,7));
  const config=loadPilotConfig({MANA_AI_ACCOUNTS_FILE:accounts,MANA_AI_KEY_FILE:key,MANA_AI_CONVERSATION_DIR:path.join(dir,'data'),MANA_AI_LOCAL_PROVIDER_URL:'http://127.0.0.1:1234/v1',MANA_AI_MODEL:'local'});
  assert.equal(config.accounts[0].userId,'alice');
  assert.equal(config.key.length,32);
  fs.writeFileSync(key,Buffer.alloc(4));
  assert.throws(()=>loadPilotConfig({MANA_AI_ACCOUNTS_FILE:accounts,MANA_AI_KEY_FILE:key,MANA_AI_CONVERSATION_DIR:path.join(dir,'data'),MANA_AI_LOCAL_PROVIDER_URL:'http://127.0.0.1:1234/v1',MANA_AI_MODEL:'local'}),/32 raw bytes/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
