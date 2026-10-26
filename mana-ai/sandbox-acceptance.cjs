'use strict';
// Required real OS acceptance command; refuses to turn missing isolation into success.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {createPythonCodeSandbox}=require('./src/native/python-code-sandbox.cjs');
const sandbox=createPythonCodeSandbox(),probe=sandbox.preflight();
if(probe.status!=='SANDBOX_PREFLIGHT_PASSED'){console.log(JSON.stringify(probe));process.exitCode=2;}else{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mana-sandbox-acceptance-')),sourceFile=path.join(root,'solution.py'),secret=path.join(root,'private-marker');
 try{fs.writeFileSync(secret,'host-private');
  const tests=[{input:0,expected:1},{input:7,expected:8},{input:-1,expected:0}];
  fs.writeFileSync(sourceFile,'def solve(x):\n    return x + 1\n');assert.equal(sandbox.evaluate({sourceFile,tests}).status,'BENCHMARK_PASSED_AWAITING_REVIEW');
  fs.writeFileSync(sourceFile,'def solve(x):\n    return 0\n');assert.equal(sandbox.evaluate({sourceFile,tests}).status,'BENCHMARK_FAILED');
  fs.writeFileSync(sourceFile,`import os,socket\ndef solve(x):\n    assert not os.path.exists(${JSON.stringify(secret)})\n    for action in [lambda: socket.socket(), lambda: os.fork(), lambda: open('/candidate.py','a')]:\n        try:\n            action()\n        except OSError:\n            pass\n        else:\n            return False\n    return True\n`);
  assert.equal(sandbox.evaluate({sourceFile,tests:[{input:0,expected:true},{input:1,expected:true},{input:2,expected:true}]}).status,'BENCHMARK_PASSED_AWAITING_REVIEW');
  fs.writeFileSync(sourceFile,'def solve(x):\n    while True: pass\n');assert.equal(sandbox.evaluate({sourceFile,tests}).status,'BENCHMARK_FAILED');assert.equal(fs.readFileSync(secret,'utf8'),'host-private');
  const benchmarks=require('./training/native-code-benchmark.json').tasks,corpus=fs.readFileSync(path.join(__dirname,'training/research-corpus.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  for(const task of benchmarks){const reference=corpus.find(row=>row.group===task.group);assert.ok(reference);fs.writeFileSync(sourceFile,reference.code);assert.equal(sandbox.evaluate({sourceFile,functionName:task.functionName,tests:task.tests}).status,'BENCHMARK_PASSED_AWAITING_REVIEW');}
  console.log(JSON.stringify({status:'REAL_SANDBOX_ACCEPTANCE_PASSED',policy:probe.policy,correctCode:true,wrongCodeRejected:true,hostFilesHidden:true,networkAndForkDenied:true,sourceReadOnly:true,cpuTimeoutRejected:true,heldOutReferenceTasksPassed:benchmarks.length,productionDeploymentAllowed:false}));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
