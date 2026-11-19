'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parseModelEnvelope,proposeLocal,evolveSkill}=require('../src/native/skill-evolution.cjs');
const {parseExactJSON}=require('../src/exact-json.cjs');
const task=require('../examples/skill.clamp-percent.json');
// Fixtures are parser/transport tests, not generated solutions or real-model evidence.
const envelope=content=>JSON.stringify({choices:[{index:0,message:{role:'assistant',content},finish_reason:'stop'}],timings:{predicted_per_second:12.34,prompt_ms:0.125},usage:{total_tokens:17},temperature:0.1});
function workspace(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-envelope-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('ordinary decimal metadata accepted without relaxing strict DSL tokens',()=>{
 assert.equal(parseModelEnvelope(envelope('{"value":0}')),'{"value":0}');
 const source='{"value":0.5}';assert.equal(parseModelEnvelope(envelope(source)),source);assert.throws(()=>parseExactJSON(source));
});
test('envelope duplicate keys including escaped spelling, deep nesting and incomplete shape fail closed',()=>{
 for(const [raw,code] of [[envelope('{}').replace('"index":0','"index":0,"index":1'),'TRANSPORT_DUPLICATE_KEY'],['{"choices":[],"choi\\u0063es":[]}','TRANSPORT_DUPLICATE_KEY'],[envelope('{}').replace('12.34','1e999'),'TRANSPORT_ENVELOPE_INVALID'],[envelope('{}').replace('"stop"','"length"'),'TRANSPORT_RESPONSE_INCOMPLETE'],['{"choices":[{"message":{"content":3}}]}','TRANSPORT_CONTENT_INVALID'],['{"choices":[]}','TRANSPORT_ENVELOPE_INVALID']])assert.throws(()=>parseModelEnvelope(raw),e=>e.code===code&&e.stage==='transport');
 assert.throws(()=>parseModelEnvelope(envelope('{}').slice(0,-1)+',"deep":'+'['.repeat(33)+'0'+']'.repeat(33)+'}'),e=>e.code==='TRANSPORT_ENVELOPE_DEPTH');
 assert.throws(()=>parseModelEnvelope(envelope('x'.repeat(20)),{contentLimit:10}),e=>e.code==='TRANSPORT_CONTENT_INVALID');
});
test('loopback HTTP decimal metadata, split UTF8, invalid UTF8 and HTTP errors have distinct evidence',async t=>{
 let mode='good';const server=http.createServer((req,res)=>{req.resume();req.on('end',()=>{if(mode==='timeout')return;if(mode==='bad-request'){res.writeHead(400);return res.end('bad input');}if(mode==='http'){res.writeHead(503);return res.end('unavailable');}if(mode==='utf8')return res.end(Buffer.from([0xff]));if(mode==='duplicate')return res.end('{"choices":[],"choices":[]}');const b=Buffer.from(envelope('{"field":"فارسی"}'));const i=b.indexOf(Buffer.from('ف'))+1;res.write(b.subarray(0,i));setImmediate(()=>res.end(b.subarray(i)));});});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const request={instruction:task.instruction,fields:task.fields,feedback:'none',port:server.address().port,timeoutMs:1000};assert.equal(await proposeLocal(request),'{"field":"فارسی"}');
 mode='bad-request';await assert.rejects(proposeLocal(request),e=>e.code==='TRANSPORT_HTTP_ERROR'&&e.httpStatus===400);mode='timeout';await assert.rejects(proposeLocal({...request,timeoutMs:25}),e=>e.code==='TRANSPORT_TIMEOUT');
 for(const [m,code] of [['http','TRANSPORT_HTTP_ERROR'],['utf8','TRANSPORT_UTF8_INVALID'],['duplicate','TRANSPORT_DUPLICATE_KEY']]){mode=m;await assert.rejects(proposeLocal(request),e=>e.code===code);}
});
test('immutable attempt receipts distinguish proposal JSON, grammar and functional failure',async t=>{
 for(const [source,stage,code] of [['{"value":0.5}','proposal','PROPOSAL_JSON_INVALID'],['null','proposal','PROPOSAL_GRAMMAR_INVALID'],['{"unknown":0}','proposal','PROPOSAL_GRAMMAR_INVALID'],['{"value":0}','benchmark','BENCHMARK_FAILED']]){
 const result=await evolveSkill({task,workspace:workspace(t),propose:async()=>source,maxAttempts:1});assert.equal(result.status,'BUDGET_EXHAUSTED');assert.deepEqual(result.lastOutcome,{stage,code});const receipt=JSON.parse(fs.readFileSync(path.join(result.directory,'attempt-1.json')));assert.deepEqual(receipt.outcome,{stage,code});assert.equal(receipt.status,'CANDIDATE_REJECTED');assert.equal(receipt.productionDeploymentAllowed,false);if(stage==='benchmark'){assert.equal(receipt.results.length,task.tests.length);assert.ok(receipt.passed<receipt.total);}else assert.equal(receipt.results.length,0);
 }
});
test('provider failures retain transport taxonomy and never create candidate attempt receipt',async t=>{
 const e=Error('sensitive provider diagnostic must not be copied');e.code='TRANSPORT_HTTP_ERROR';e.stage='transport';e.httpStatus=400;const result=await evolveSkill({task,workspace:workspace(t),propose:async()=>{throw e;},maxAttempts:1});assert.equal(result.status,'DEPENDENCY_UNAVAILABLE');assert.deepEqual(result.outcome,{stage:'transport',code:'TRANSPORT_HTTP_ERROR',httpStatus:400});assert.equal(fs.existsSync(path.join(result.directory,'attempt-1.json')),false);assert.equal(JSON.stringify(result).includes('sensitive'),false);
});

test('functional zero of six is persisted separately from proposal failures; exhausted resume never invokes provider',async t=>{
 const synthetic={schema:'MANA_SKILL_TASK_V1',id:'transport-fixture-six',instruction:'Synthetic parser classification test only.',fields:['x'],tests:[1,2,3,4,5,6].map(x=>({input:{x},expected:x}))};
 const dir=workspace(t);const result=await evolveSkill({task:synthetic,workspace:dir,propose:async()=>'{"value":0}',maxAttempts:1});
 const file=path.join(result.directory,'attempt-1.json'),bytes=fs.readFileSync(file),receipt=JSON.parse(bytes);assert.equal(receipt.total,6);assert.equal(receipt.passed,0);assert.equal(receipt.outcome.code,'BENCHMARK_FAILED');assert.equal(receipt.results.length,6);
 const resumed=await evolveSkill({task:synthetic,workspace:dir,propose:async()=>{throw Error('must not call');},maxAttempts:1});assert.equal(resumed.status,'BUDGET_EXHAUSTED');assert.equal(resumed.lastOutcome.code,'BENCHMARK_FAILED');assert.deepEqual(fs.readFileSync(file),bytes);
});
test('existing coding transport content limits remain supported while candidates stay separately bounded',()=>{
 const source='x'.repeat(32000);assert.equal(parseModelEnvelope(envelope(source),{responseLimit:262144,contentLimit:128000}),source);assert.throws(()=>parseModelEnvelope(envelope(source)),e=>e.code==='TRANSPORT_CONTENT_INVALID');
});
