'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {evaluateExpression,validateExpression}=require('../src/native/skill-expression.cjs');
const {evolveSkill,proposeLocal,validateTask}=require('../src/native/skill-evolution.cjs');
const example=require('../examples/skill.clamp-percent.json');
const clamp={op:'min',args:[{value:100},{op:'max',args:[{value:0},{field:'percent'}]}]};
function workspace(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-evolution-'));fs.chmodSync(dir,0o700);t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('bounded declarative skill handles arithmetic, branch, types and numeric failure',()=>{
 assert.equal(evaluateExpression(clamp,{percent:42.5},['percent']),42.5);
 assert.equal(evaluateExpression({op:'if',args:[{value:true},{value:7},{op:'divide',args:[{value:1},{value:0}]}]},{},[]),7);
 for(const expression of [{op:'require',args:[]},{field:'constructor'},{value:Infinity},{value:1,extra:true},{op:'divide',args:[{value:1},{value:0}]},{op:'add',args:[{value:true},{value:1}]},{op:'multiply',args:[{value:1e12},{value:1e12}]}])assert.throws(()=>evaluateExpression(expression,{},[]));
 assert.throws(()=>evaluateExpression(clamp,{percent:2,scope:'foreign'},['percent']));
 let deep={value:1};for(let i=0;i<14;i++)deep={op:'min',args:[deep,{value:1}]};assert.throws(()=>validateExpression(deep,[]),/budget/);
});
test('candidate repair loop uses independent hidden tests, immutable receipts and verified restart',async t=>{
 const dir=workspace(t);let calls=0;const propose=async request=>{assert.equal(Object.hasOwn(request,'tests'),false);assert.equal(Object.hasOwn(request,'expected'),false);calls++;return JSON.stringify(calls===1?{value:0}:clamp);};
 const result=await evolveSkill({task:example,workspace:dir,propose});assert.equal(result.status,'BENCHMARK_PASSED_AWAITING_REVIEW');assert.equal(result.attempt,2);assert.equal(result.passed,5);assert.equal(result.approved,false);assert.equal(result.productionDeploymentAllowed,false);
 const bytes=fs.readFileSync(path.join(result.directory,'attempt-2.json'));
 const again=await evolveSkill({task:example,workspace:dir,propose:async()=>{throw Error('must not invoke');}});assert.equal(again.resumed,true);assert.equal(again.candidateHash,result.candidateHash);assert.deepEqual(fs.readFileSync(path.join(result.directory,'attempt-2.json')),bytes);assert.equal(calls,2);
 const old=JSON.parse(bytes);old.expression={value:0};fs.writeFileSync(path.join(result.directory,'attempt-2.json'),JSON.stringify(old));await assert.rejects(evolveSkill({task:example,workspace:dir,propose}),/evidence/);
});
test('arbitrary JavaScript, duplicate JSON and failed benchmarks never execute or promote',async t=>{
 const dir=workspace(t),marker=path.join(dir,'OWNED');let calls=0;
 const result=await evolveSkill({task:example,workspace:dir,propose:async()=>[++calls===1?`require('fs').writeFileSync('${marker}','bad')`:'{"value":0,"value":100}'][0],maxAttempts:2});
 assert.equal(result.status,'BUDGET_EXHAUSTED');assert.equal(fs.existsSync(marker),false);assert.equal(result.productionDeploymentAllowed,false);
 assert.equal(fs.readdirSync(result.directory).filter(x=>x.startsWith('attempt')).length,2);
});
test('provider absence is resumable and does not consume generation budget',async t=>{
 const dir=workspace(t);const absent=await evolveSkill({task:example,workspace:dir,propose:async()=>{throw Error('offline');}});assert.equal(absent.status,'DEPENDENCY_UNAVAILABLE');assert.equal(fs.existsSync(path.join(absent.directory,'attempt-1.json')),false);
 const good=await evolveSkill({task:example,workspace:dir,propose:async()=>JSON.stringify(clamp)});assert.equal(good.attempt,1);assert.equal(good.passed,5);
});
test('task mutation creates distinct checkpoint, unsafe workspace and concurrent worker stop',async t=>{
 const dir=workspace(t);assert.throws(()=>validateTask({...example,tests:[]}));
 fs.chmodSync(dir,0o755);await assert.rejects(evolveSkill({task:example,workspace:dir}),/Private/);fs.chmodSync(dir,0o700);
 let release;const wait=new Promise(r=>release=r);let started;const ready=new Promise(r=>started=r);
 const first=evolveSkill({task:example,workspace:dir,propose:async()=>{started();await wait;return JSON.stringify(clamp);}});await ready;
 await assert.rejects(evolveSkill({task:example,workspace:dir,propose:async()=>JSON.stringify(clamp)}),/EEXIST/);release();const a=await first;
 const b=await evolveSkill({task:{...example,instruction:example.instruction+' Revised.'},workspace:dir,propose:async()=>JSON.stringify(clamp)});assert.notEqual(a.directory,b.directory);
});
test('real loopback provider bounds response, rejects redirects, times out and withholds benchmark',async t=>{
 let mode='good',received;const server=http.createServer((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{received=JSON.parse(body);if(mode==='timeout')return;if(mode==='redirect'){res.writeHead(302,{Location:'https://example.com'});return res.end();}res.end(JSON.stringify({choices:[{message:{content:mode==='large'?'x'.repeat(40000):JSON.stringify(clamp)}}]}));});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const request={instruction:example.instruction,fields:example.fields,feedback:'none',port:server.address().port,timeoutMs:1000};
 assert.deepEqual(JSON.parse(await proposeLocal(request)),clamp);assert.equal(JSON.stringify(received).includes('tests'),false);
 mode='redirect';await assert.rejects(proposeLocal(request));mode='large';await assert.rejects(proposeLocal(request));mode='timeout';await assert.rejects(proposeLocal({...request,timeoutMs:30}));
});
