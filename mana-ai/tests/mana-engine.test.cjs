'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createManaEngine}=require('../src/mana-engine.cjs');
test('Mana engine retains bounded isolated context without executing tools',async()=>{
 const calls=[];
 const engine=createManaEngine({model:'local-model',maxTurns:1,provider:{complete:async x=>{calls.push(x);return 'پاسخ مانا'}}});
 const a=await engine.ask({prompt:'سلام',sessionId:'a'});
 assert.equal(a.actionsExecuted,0);
 await engine.ask({prompt:'دوباره',sessionId:'a'});
 assert.equal(calls[1].messages.length,4);
 await engine.ask({prompt:'جدید',sessionId:'b'});
 assert.equal(calls[2].messages.length,2);
 engine.clear('a');
 await engine.ask({prompt:'بعد از حذف',sessionId:'a'});
 assert.equal(calls[3].messages.length,2);
});
test('rejects invalid input and invalid model responses',async()=>{
 assert.throws(()=>createManaEngine({model:'bad',provider:{}}));
 const engine=createManaEngine({model:'local',provider:{complete:async()=>''}});
 await assert.rejects(engine.ask({prompt:'سلام'}),/Invalid model response/);
 await assert.rejects(engine.ask({prompt:' ',sessionId:'a'}),/Invalid prompt/);
 await assert.rejects(engine.ask({prompt:'hi',sessionId:'../'}),/Invalid session/);
});
test('native planning is separate from language inference and preserves proposal gates',()=>{
 let calls=0;
 const engine=createManaEngine({model:'local',provider:{complete:async()=>{calls++;return 'reply'}},nativeCapabilities:[{id:'draft',title:'پیش‌نویس',requires:['source'],produces:['ready'],workUnits:1,risk:'draft'}]});
 const result=engine.plan({principal:{id:'u',orgId:'org',role:'analyst',projectIds:['p'],capabilityIds:['draft']},project:{id:'p',orgId:'org'},objective:'گزارش',goals:['ready'],evidence:[{id:'e',orgId:'org',projectId:'p',key:'source',value:true,source:'synthetic',verification:'verified'}]});
 assert.equal(result.status,'PLAN_PROPOSED');assert.equal(calls,0);assert.equal(result.actionsExecuted,0);
});
test('zero-turn chat configuration does not retain previous conversation history',async()=>{
 const calls=[];
 const engine=createManaEngine({model:'local',maxTurns:0,provider:{complete:async request=>{calls.push(request.messages);return 'reply'}}});
 await engine.ask({prompt:'first'});await engine.ask({prompt:'second'});
 assert.equal(calls[1].length,2);assert.equal(calls[1].some(m=>m.content==='first'),false);
});
