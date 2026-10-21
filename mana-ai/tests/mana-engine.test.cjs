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
