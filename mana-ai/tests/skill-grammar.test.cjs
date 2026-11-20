'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {buildSkillGrammar,MAX_DEPTH}=require('../src/native/skill-grammar.cjs');
const {proposeLocal,evolveSkill}=require('../src/native/skill-evolution.cjs');
const {validateExpression}=require('../src/native/skill-expression.cjs');
// Independent small recognizer for the emitted acyclic GBNF subset. Not llama.cpp runtime proof.
function recognizer(grammar){
 const rules=new Map(grammar.trim().split('\n').map(line=>line.split(' ::= '))),cache=new Map();
 function expand(name){if(cache.has(name))return cache.get(name);const text=rules.get(name);assert.equal(typeof text,'string');let end=0,out='';for(const m of text.matchAll(/"(?:\\.|[^"\\])*"|\[[^\]]+\]|\{\d+(?:,\d*)?\}|[a-z][a-z0-9-]*|[()|?]/g)){assert.equal(text.slice(end,m.index).trim(),'');end=m.index+m[0].length;const t=m[0];out+=t.startsWith('"')?JSON.parse(t).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'):/^[a-z]/.test(t)?'(?:'+expand(t)+')':t;}assert.equal(text.slice(end).trim(),'');cache.set(name,out);return out;}return new RegExp('^(?:'+expand('root')+')$');
}
test('managed grammar accepts only bounded integer/boolean DSL subset and declared fields',()=>{
 const grammar=buildSkillGrammar(['x','y']),accept=recognizer(grammar);assert.ok(grammar.length<8192);assert.equal(MAX_DEPTH,4);
 for(const x of [{value:0},{value:-1000000000000},{value:true},{field:'x'},{op:'add',args:[{field:'x'},{field:'y'}]},{op:'if',args:[{value:true},{value:1},{value:2}]}]){assert.ok(accept.test(JSON.stringify(x)));validateExpression(x,['x','y']);}
 for(const text of ['{"value":1.5}','{"value":1e2}','{"value":1000000000001}','{"field":"undeclared"}','{"op":"add","args":[{"value":1}]}','{"op":"if","args":[{"value":true},{"value":1}]}','{"op":"require","args":[]}','{"value":1,"extra":0}'])assert.equal(accept.test(text),false,text);
 let tree={value:0};for(let i=0;i<4;i++)tree={op:'if',args:[tree,tree,tree]};assert.ok(accept.test(JSON.stringify(tree)));validateExpression(tree,['x','y']);tree={op:'if',args:[tree,{value:0},{value:0}]};assert.equal(accept.test(JSON.stringify(tree)),false);
 assert.equal(recognizer(buildSkillGrammar([])).test('{"field":"x"}'),false);
});
test('field whitelist cannot inject grammar and grammar contains no instruction or benchmark',()=>{
 for(const fields of [['bad"\nroot ::= .*'],['constructor'],['x','x'],Array.from({length:17},(_,i)=>'a'+i)])assert.throws(()=>buildSkillGrammar(fields));
 assert.equal(buildSkillGrammar(['y','x']),buildSkillGrammar(['x','y']));assert.equal(buildSkillGrammar(['x']).includes('expected'),false);
});
test('opt-in HTTP sends fixed grammar once; legacy payload has no grammar; HTTP400 never falls back',async t=>{
 const calls=[];let bad=false;const server=http.createServer((req,res)=>{let text='';req.on('data',b=>text+=b);req.on('end',()=>{calls.push(JSON.parse(text));if(bad){res.writeHead(400);return res.end('{}');}res.end(JSON.stringify({choices:[{message:{content:'not JSON'}}]}));});});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const request={port:server.address().port,instruction:'Synthetic transport test only.',fields:['x'],feedback:'none',timeoutMs:1000};await proposeLocal(request);assert.equal(Object.hasOwn(calls[0],'grammar'),false);await proposeLocal({...request,constraint:'llama-gbnf-v1'});assert.equal(calls[1].grammar,buildSkillGrammar(['x']));assert.deepEqual({...calls[1],grammar:undefined},{...calls[0],grammar:undefined});bad=true;await assert.rejects(proposeLocal({...request,constraint:'llama-gbnf-v1'}),e=>e.httpStatus===400);assert.equal(calls.length,3);
 assert.throws(()=>proposeLocal({...request,constraint:'custom'}));assert.equal(calls.length,3);
});
test('malformed constrained response is recorded by unchanged strict evaluator, not repaired or retried',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-grammar-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let calls=0;
 const task={schema:'MANA_SKILL_TASK_V1',id:'grammar-fixture',instruction:'Synthetic parser classification only.',fields:['x'],tests:[1,2,3].map(x=>({input:{x},expected:x}))};
 const r=await evolveSkill({task,workspace:dir,maxAttempts:1,propose:async()=>{calls++;return 'not JSON';}});assert.equal(calls,1);assert.equal(r.lastOutcome.code,'PROPOSAL_JSON_INVALID');assert.equal(r.productionDeploymentAllowed,false);const receipt=JSON.parse(fs.readFileSync(path.join(r.directory,'attempt-1.json')));assert.equal(receipt.results.length,0);
});
