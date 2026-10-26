'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {repairCode}=require('../src/native/code-repair.cjs');
const {createPythonCodeSandbox,seccompFilter}=require('../src/native/python-code-sandbox.cjs');
const {draftCode,createLocalCodeProposer}=require('../src/native/code-workbench.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function setup(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mana-repair-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const projectRoot=path.join(directory,'project'),workspace=path.join(directory,'review');fs.mkdirSync(projectRoot);return {projectRoot,workspace,request:'Write a pure Python solve function that adds one to the input integer.',benchmark:{functionName:'solve',tests:[{input:0,expected:1},{input:3,expected:4},{input:-1,expected:0}]}};}
test('native seccomp policy rejects fork/network/namespace syscalls and foreign ABIs',()=>{
 const filter=seccompFilter();function emulate(nr,arch=0xc000003e){let acc=0,pc=0;while(pc<filter.length/8){const offset=pc*8,code=filter.readUInt16LE(offset),k=filter.readUInt32LE(offset+4),jt=filter[offset+2],jf=filter[offset+3];if(code===0x20){acc=k===4?arch:nr;pc++;}else if(code===0x15)pc+=1+(acc===k?jt:jf);else if(code===0x35)pc+=1+(acc>=k?jt:jf);else if(code===0x06)return k;else throw Error('Unsupported BPF');}throw Error('No decision');}
 for(const syscall of [41,42,56,57,58,165,272,308,321,425,435])assert.equal(emulate(syscall),0x50001);
 assert.equal(emulate(0),0x7fff0000);assert.equal(emulate(1),0x7fff0000);assert.equal(emulate(0x40000000),0x50001);assert.equal(emulate(0,0x40000003),0x80000000);
});
test('real sandbox reports unavailable without executing any candidate; available hosts run isolated cases',t=>{
 const args=setup(t),source=path.join(args.projectRoot,'solution.py'),marker=path.join(args.projectRoot,'host-marker');fs.writeFileSync(marker,'private');fs.writeFileSync(source,`def solve(value):\n    return value + 1\n`);
 const sandbox=createPythonCodeSandbox(),availability=sandbox.preflight(),result=sandbox.evaluate({sourceFile:source,...args.benchmark});
 if(availability.status==='SANDBOX_UNAVAILABLE'){assert.equal(result.status,'SANDBOX_UNAVAILABLE');assert.equal(result.candidateExecuted,false);}else{assert.equal(result.status,'BENCHMARK_PASSED_AWAITING_REVIEW');assert.equal(result.passed,3);}
 assert.equal(fs.readFileSync(marker,'utf8'),'private');
});
test('repair controller rejects a bad draft, gives bounded feedback and retains a passing candidate separately',async t=>{
 const args=setup(t);let calls=0;const propose=async context=>{calls++;assert.equal(context.instruction.includes('"expected"'),false);return JSON.stringify({files:[{path:'solution.py',content:calls===1?'def solve(x):\n    return 0\n':'def solve(x):\n    return x + 1\n'}]});};
 // Explicit host verifier fixture; this is NOT evidence of OS sandbox acceptance.
 const sandbox={preflight:()=>({status:'SANDBOX_PREFLIGHT_PASSED'}),evaluate:({sourceFile,tests})=>{const source=fs.readFileSync(sourceFile),pass=source.toString().includes('x + 1');return {status:pass?'BENCHMARK_PASSED_AWAITING_REVIEW':'BENCHMARK_FAILED',candidateSha256:hash(source),total:tests.length,passed:pass?tests.length:0,results:tests.map((_,index)=>({index,pass})),approved:false};}};
 const result=await repairCode({...args,propose,sandbox});assert.equal(result.status,'CODE_CANDIDATE_AWAITING_REVIEW');assert.equal(result.attempts.length,2);assert.equal(result.approved,false);assert.equal(result.productionDeploymentAllowed,false);assert.equal(fs.existsSync(path.join(args.projectRoot,'solution.py')),false);assert.match(fs.readFileSync(path.join(result.candidateDirectory,'solution.py'),'utf8'),/x \+ 1/);
});
test('missing sandbox/model, forged receipt and changed source stop rather than bypass controls',async t=>{
 const args=setup(t);let calls=0;const unavailable=await repairCode({...args,propose:async()=>{calls++;},sandbox:{preflight:()=>({status:'SANDBOX_UNAVAILABLE'}),evaluate:()=>{throw Error();}}});assert.equal(calls,0);assert.equal(unavailable.candidateExecuted,false);
 const absent=await repairCode({...args,sandbox:{preflight:()=>({status:'SANDBOX_PREFLIGHT_PASSED'}),evaluate:()=>{throw Error();}}});assert.equal(absent.status,'CODING_PROVIDER_UNCONFIGURED');
 const proposal=async()=>JSON.stringify({files:[{path:'solution.py',content:'def solve(x): return x+1'}]});
 await assert.rejects(repairCode({...args,propose:proposal,sandbox:{preflight:()=>({status:'SANDBOX_PREFLIGHT_PASSED'}),evaluate:()=>({candidateSha256:'forged'})}}),/receipt/);
 const changed=await repairCode({...args,propose:async context=>{fs.writeFileSync(path.join(args.projectRoot,'solution.py'),'host changed');return proposal(context);},sandbox:{preflight:()=>({status:'SANDBOX_PREFLIGHT_PASSED'}),evaluate:()=>{throw Error('must not execute');}}});assert.equal(changed.status,'SOURCE_CHANGED_STOPPED');
});
test('code authoring no longer selects an implicit model or default Gemma endpoint',async t=>{
 const args=setup(t),result=await draftCode({...args,allowedFiles:['solution.py']});assert.equal(result.status,'CODING_PROVIDER_UNCONFIGURED');assert.throws(()=>createLocalCodeProposer({port:8794}),/Explicit/);
});
