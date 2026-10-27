'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createReadOnlyAgentTools}=require('../src/agent-tools.cjs');
const {createAgentRunner}=require('../src/agent-runner.cjs');
const {createAuditLog}=require('../src/audit.cjs');
const projects=[{id:'p1',orgId:'org1',name:'One'},{id:'p2',orgId:'org2',name:'Two'}];
const documents=[{id:'d1',orgId:'org1',projectId:'p1',title:'Budget',text:'The budget is approved.'},{id:'d2',orgId:'org2',projectId:'p2',title:'Budget',text:'Secret competitor budget.'}];
const principal={id:'a',orgId:'org1',role:'analyst',projectIds:['p1']};
test('read-only tool returns only authorized project document',async()=>{
  const audit=createAuditLog();const runner=createAgentRunner({audit,tools:createReadOnlyAgentTools({projects,documents})});
  const ok=await runner.execute({principal,action:'documents:read',scope:'p1',input:{question:'budget'}});
  assert.equal(ok.ok,true);assert.equal(ok.result.sources.length,1);assert.equal(ok.result.sources[0].documentId,'d1');
  const denied=await runner.execute({principal,action:'documents:read',scope:'p2',input:{question:'budget'}});
  assert.equal(denied.ok,false);assert.equal(denied.error,'tool_failed');
  assert.equal(audit.list('org1').length,2);
});
test('read-only tool refuses caller supplied documents and malformed queries',async()=>{
  const runner=createAgentRunner({audit:createAuditLog(),tools:createReadOnlyAgentTools({projects,documents})});
  const result=await runner.execute({principal,action:'documents:read',scope:'p1',input:{question:'budget',documents:[{text:'injected'}]}});
  assert.equal(result.ok,false);
});
