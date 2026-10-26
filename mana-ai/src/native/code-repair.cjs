'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {draftCode,sourceAt,safePath}=require('./code-workbench.cjs');
const {payloadDigest}=require('../approval-store.cjs');
const {parseExactJSON}=require('../exact-json.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
// Pure Python function drafts only. No apply, deploy, generated tests or provider fallback.
async function repairCode({projectRoot,workspace,request,file='solution.py',benchmark,propose,sandbox,maxAttempts=3}){
 if(typeof request!=='string'||request.length<10||request.length>3500||!path.isAbsolute(projectRoot)||!path.isAbsolute(workspace)||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>3||safePath(file)!==file||!file.endsWith('.py')||!sandbox||typeof sandbox.preflight!=='function'||typeof sandbox.evaluate!=='function')throw Error('Bounded code-repair contract required');
 if(workspace===projectRoot||workspace.startsWith(projectRoot+path.sep)||fs.lstatSync(projectRoot).isSymbolicLink())throw Error('Separate project/review roots required');
 if(!benchmark||Object.keys(benchmark).sort().join(',')!=='functionName,tests'||typeof benchmark.functionName!=='string'||!/^[a-z][a-z0-9_]{0,39}$/.test(benchmark.functionName)||!Array.isArray(benchmark.tests)||benchmark.tests.length<3||benchmark.tests.length>32)throw Error('Independent benchmark required');
 for(const test of benchmark.tests){if(!test||Object.keys(test).sort().join(',')!=='expected,input'||Buffer.byteLength(JSON.stringify(test))>8192)throw Error('Bounded test data required');parseExactJSON(JSON.stringify(test));}
 payloadDigest(benchmark);if(Buffer.byteLength(JSON.stringify(benchmark))>100000)throw Error('Benchmark bound');
 const readiness=sandbox.preflight();if(readiness.status!=='SANDBOX_PREFLIGHT_PASSED')return {status:'SANDBOX_UNAVAILABLE',candidateExecuted:false,approved:false,productionDeploymentAllowed:false};
 if(typeof propose!=='function')return {status:'CODING_PROVIDER_UNCONFIGURED',candidateExecuted:false,approved:false,productionDeploymentAllowed:false};
 const original=sourceAt(projectRoot,file),binding=payloadDigest({request,file,original,benchmark});
 fs.mkdirSync(workspace,{recursive:true,mode:0o700});const info=fs.lstatSync(workspace);if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077))throw Error('Private review workspace required');
 const directory=fs.mkdtempSync(path.join(workspace,'repair-')),attempts=[];let feedback='',previous='';
 function save(result){const report={schema:'MANA_CODE_REPAIR_V1',binding,directory,attempts,...result,approved:false,productionDeploymentAllowed:false};fs.writeFileSync(path.join(directory,'result-'+attempts.length+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});return report;}
 for(let number=1;number<=maxAttempts;number++){
  if(sourceAt(projectRoot,file)!==original)return save({status:'SOURCE_CHANGED_STOPPED'});
  let draft;
  try{draft=await draftCode({request:request+(feedback?'\nRepair feedback: '+feedback+'\nPrevious draft excerpt:\n'+previous.slice(0,1800):''),projectRoot,allowedFiles:[file],workspace:path.join(directory,'attempt-'+number),propose});}
  catch{attempts.push({number,status:'INVALID_DRAFT'});feedback='The previous file proposal was invalid. Return one complete file using the exact requested path.';continue;}
  if(draft.status!=='CODE_DRAFT_AWAITING_SANDBOX')return save({status:draft.status});
  if(sourceAt(projectRoot,file)!==original)return save({status:'SOURCE_CHANGED_STOPPED'});
  const sourceFile=path.join(draft.directory,'candidate',file),bytes=fs.readFileSync(sourceFile);previous=bytes.toString('utf8');
  const result=sandbox.evaluate({sourceFile,functionName:benchmark.functionName,tests:benchmark.tests});
  if(result.status==='SANDBOX_UNAVAILABLE')return save({status:result.status,candidateExecuted:false});
  if(result.candidateSha256!==hash(bytes)||result.total!==benchmark.tests.length||!Array.isArray(result.results)||result.results.length!==result.total||result.passed!==result.results.filter(r=>r.pass===true).length)throw Error('Sandbox receipt mismatch');
  attempts.push({number,draftDirectory:draft.directory,candidateSha256:result.candidateSha256,benchmark:result});
  if(result.status==='BENCHMARK_PASSED_AWAITING_REVIEW'&&result.passed===result.total)return save({status:'CODE_CANDIDATE_AWAITING_REVIEW',candidateDirectory:path.dirname(sourceFile),candidateExecuted:true});
  feedback='Independent benchmark failed ('+result.passed+'/'+result.total+'). Reconsider edge cases and validation. Expected outputs and test inputs are not disclosed.';
 }
 return save({status:'REPAIR_BUDGET_EXHAUSTED'});
}
module.exports={repairCode};
