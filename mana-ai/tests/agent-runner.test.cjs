'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createAgentRunner} = require('../src/agent-runner.cjs');
const {createAuditLog} = require('../src/audit.cjs');
const admin={id:'a',orgId:'org1',role:'admin'};
test('runner denies high risk tools without invoking them',async()=>{
  let invoked=false;const audit=createAuditLog();
  assert.throws(()=>createAgentRunner({audit,tools:{'payments:execute':async()=>{invoked=true;}}}),/Unapproved tool/);
  const runner=createAgentRunner({audit,tools:{'documents:read':async()=>{invoked=true;}}});
  const result=await runner.execute({principal:admin,action:'payments:execute',scope:'p1',input:{}});
  assert.equal(result.ok,false);assert.equal(invoked,false);
  assert.equal(audit.list('org1').at(-1).outcome,'denied');
});
test('runner forwards only scoped principal and audits successful read',async()=>{
  const audit=createAuditLog();let received;
  const runner=createAgentRunner({audit,tools:{'documents:read':async ctx=>{received=ctx;return {count:1};}}});
  const result=await runner.execute({principal:{...admin,token:'secret'},action:'documents:read',scope:'p1',input:{filter:'x'}});
  assert.deepEqual(result,{ok:true,result:{count:1}});
  assert.equal(received.principal.token,undefined);
  assert.equal(received.scope,'p1');
  assert.equal(audit.list('org1').at(-1).outcome,'allowed');
});
test('runner denies viewer strategy drafts and rejects oversized inputs',async()=>{
  const audit=createAuditLog();const runner=createAgentRunner({audit,tools:{'strategy:draft':async()=>({ok:true}),'documents:read':async()=>({ok:true})}});
  assert.equal((await runner.execute({principal:{...admin,role:'viewer'},action:'strategy:draft',scope:'p1',input:{}})).ok,false);
  assert.equal((await runner.execute({principal:admin,action:'documents:read',scope:'p1',input:{text:'x'.repeat(5000)}})).error,'invalid_input');
});

test('runner enforces deadline for non-cooperative tools',async()=>{
  const audit=createAuditLog();
  const runner=createAgentRunner({audit,timeoutMs:100,tools:{'documents:read':async()=>new Promise(()=>{})}});
  const started=Date.now();
  const result=await runner.execute({principal:admin,action:'documents:read',scope:'p1',input:{}});
  assert.deepEqual(result,{ok:false,error:'tool_failed'});
  assert.ok(Date.now()-started<2000);
  assert.equal(audit.list('org1').at(-1).outcome,'failed');
});
