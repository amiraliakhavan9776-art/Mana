'use strict';
/**
 * MANA V14: bounded module patch candidate review.
 * Reads source snapshots, stages isolated candidates, verifies independent tests.
 * Never executes candidate on host and never edits source tree.
 * A verifier is an explicit trust boundary: only a real sandbox verifier qualifies.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const HEX=/^[0-9a-f]{64}$/;
const {inspectPatch}=require('./patch-risk-gate.cjs');
const {verifyAttestation}=require('./sandbox-attestation.cjs');
const REL=/^(?!\/)(?!.*(?:^|\/)\.\.?\/)(?!.*\\)[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
function isObject(x){return !!x&&typeof x==='object'&&!Array.isArray(x)}
function checkedRoot(root){
 if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Absolute root required');
 const st=fs.lstatSync(root);if(!st.isDirectory()||st.isSymbolicLink())throw Error('Invalid root');
 return fs.realpathSync(root);
}
function safeFile(root,rel,{allowMissing=false}={}){
 if(typeof rel!=='string'||!REL.test(rel)||rel.length>180||rel.split('/').some(s=>s==='.'||s==='..'))throw Error('Unsafe file path');
 let node=root;
 for(const seg of rel.split('/')){
  node=path.join(node,seg);
  try{const st=fs.lstatSync(node);if(st.isSymbolicLink()||(!st.isFile()&&!st.isDirectory())||(st.isFile()&&st.nlink!==1))throw Error('Unsupported source entry')}
  catch(e){if(e.code==='ENOENT'&&allowMissing)continue;throw e}
 }
 if(!allowMissing&&!fs.statSync(node).isFile())throw Error('Expected regular file');
 return node;
}
function assertWorkspace(root,workspace){
 const dst=checkedRoot(workspace);const mode=fs.statSync(dst).mode;
 if((mode&0o077)!==0)throw Error('Workspace must be private 0700');
 if(dst===root||dst.startsWith(root+path.sep)||root.startsWith(dst+path.sep))throw Error('Workspace/source overlap');
 return dst;
}
function createModulePatchReviewer({projectRoot,workspace,propose,verify,maxAttempts=3,maxFiles=6,maxBytes=50000,attestationKey,trustedTestSha256,requireAttestation=false}={}){
 const root=checkedRoot(projectRoot), work=assertWorkspace(root,workspace);
 if(typeof propose!=='function'||typeof verify!=='function')throw Error('Producer and independent sandbox verifier required');
 if(trustedTestSha256!==undefined&&!HEX.test(trustedTestSha256))throw Error('Invalid trusted test digest');
 if(requireAttestation && (!attestationKey || !trustedTestSha256))throw Error('Strict attestation requires signing key and pinned trusted test');
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>8||!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>10||!Number.isInteger(maxBytes)||maxBytes<256||maxBytes>300000)throw Error('Invalid limits');
 async function review({request,allowedFiles,baseHashes,signal}={}){
  if(typeof request!=='string'||request.trim().length<12||request.length>6000)throw Error('Invalid request');
  if(!Array.isArray(allowedFiles)||allowedFiles.length<1||allowedFiles.length>maxFiles||new Set(allowedFiles).size!==allowedFiles.length)throw Error('Invalid file allowlist');
  if(!isObject(baseHashes)||Object.keys(baseHashes).length!==allowedFiles.length)throw Error('Base hash map required');
  const originals={};let sum=0;
  for(const rel of allowedFiles){
   const file=safeFile(root,rel),data=fs.readFileSync(file);
   sum+=data.length;if(sum>maxBytes)throw Error('Source budget exceeded');
   if(data.includes(0))throw Error('Binary source denied');
   if(!HEX.test(baseHashes[rel]??'')||hash(data)!==baseHashes[rel])throw Error('Source version conflict');
   originals[rel]=data.toString('utf8');
  }
  const attempts=[],requestSha256=hash(request),baseDigest=hash(JSON.stringify(allowedFiles.map(p=>[p,baseHashes[p]])));
  let feedback=null;
  for(let n=0;n<maxAttempts;n++){
   if(signal?.aborted)return makeReceipt('CANCELLED');
   const trial=fs.mkdtempSync(path.join(work,'module-trial-'));fs.chmodSync(trial,0o700);
   try{
    const proposal=await propose({request,originals:{...originals},allowedFiles:[...allowedFiles],feedback:feedback?structuredClone(feedback):null,attempt:n+1,signal});
    if(!isObject(proposal)||!Array.isArray(proposal.files)||proposal.files.length<1||proposal.files.length>maxFiles)throw Error('Invalid proposal shape');
    const names=new Set();let bytes=0;const candidates=[];
    for(const f of proposal.files){
     if(!isObject(f)||typeof f.path!=='string'||!allowedFiles.includes(f.path)||names.has(f.path)||typeof f.content!=='string')throw Error('Out-of-scope patch');
     names.add(f.path);bytes+=Buffer.byteLength(f.content);if(bytes>maxBytes||f.content.includes('\0'))throw Error('Candidate budget exceeded');
     candidates.push({path:f.path,sourceSha256:hash(f.content),content:f.content});
    }
    // Fail closed on static risk findings before invoking any executable verifier.
    const risk=inspectPatch({files:candidates.map(c=>({path:c.path,content:c.content})),allowedFiles,baseHashes,requestSha256});
    if(risk.status!=='STATIC_SCREEN_PASSED'){
     attempts.push({attempt:n+1,status:'STATIC_SECURITY_REVIEW_REQUIRED',findings:risk.findings,sourceHashes:risk.hashes});
     return makeReceipt('MANUAL_SECURITY_REVIEW');
    }
    // An isolated file tree contains ONLY the source files allowlisted for the attempt.
    for(const rel of allowedFiles){
     const content=candidates.find(c=>c.path===rel)?.content??originals[rel];
     const abs=path.join(trial,rel);fs.mkdirSync(path.dirname(abs),{recursive:true,mode:0o700});fs.writeFileSync(abs,content,{flag:'wx',mode:0o600});
    }
    // Race detection: reject if source changed since review started.
    for(const rel of allowedFiles){if(hash(fs.readFileSync(safeFile(root,rel)))!==baseHashes[rel])throw Error('Source changed during review')}
    const inspectionFiles=allowedFiles.map(rel=>({path:rel,newSha256:hash(fs.readFileSync(path.join(trial,rel)))}));
    const inspection=await verify({candidateDir:trial,files:inspectionFiles.map(f=>({...f})),requestSha256,signal});
    if(!isObject(inspection)||typeof inspection.passed!=='boolean'||typeof inspection.executed!=='boolean'||typeof inspection.testSha256!=='string'||!HEX.test(inspection.testSha256)||inspection.sandboxVerified!==true){
     attempts.push({attempt:n+1,status:'SANDBOX_UNVERIFIED',sourceHashes:candidates.map(c=>({path:c.path,sha256:c.sourceSha256}))});
     return makeReceipt('SANDBOX_UNAVAILABLE');
    }
    // Verify staged bytes again after the verifier returns: a callback must not swap candidates.
    const stagedHashes=allowedFiles.map(rel=>({path:rel,newSha256:hash(fs.readFileSync(path.join(trial,rel)))}));
    if(stagedHashes.some(f=>!inspectionFiles.some(g=>g.path===f.path&&g.newSha256===f.newSha256))){
     attempts.push({attempt:n+1,status:'STAGED_CANDIDATE_CHANGED'});
     return makeReceipt('SANDBOX_UNAVAILABLE');
    }
    // A verifier must not substitute its own test suite for the caller-pinned trusted suite.
    if(trustedTestSha256 && inspection.testSha256!==trustedTestSha256){
     attempts.push({attempt:n+1,status:'TRUSTED_TEST_MISMATCH'});
     return makeReceipt('SANDBOX_UNAVAILABLE');
    }
    // Optional hardened mode: bind independent sandbox result to exact test and candidate hashes.
    // Without attestationKey, legacy verification remains explicitly a trusted callback boundary.
    if(attestationKey && (inspection.attestation?.passed!==inspection.passed || !verifyAttestation({key:attestationKey,attestation:inspection.attestation,expected:{requestSha256,testSha256:inspection.testSha256,files:allowedFiles.map(rel=>({path:rel,newSha256:hash(fs.readFileSync(path.join(trial,rel)))}))}}))){
     attempts.push({attempt:n+1,status:'ATTESTATION_REJECTED'});
     return makeReceipt('SANDBOX_UNAVAILABLE');
    }
    const record={attempt:n+1,status:inspection.executed?(inspection.passed?'PASSED':'FAILED'):'NOT_EXECUTED',testSha256:inspection.testSha256,sourceHashes:candidates.map(c=>({path:c.path,sha256:c.sourceSha256}))};
    attempts.push(record);
    if(!inspection.executed)return makeReceipt('SANDBOX_UNAVAILABLE');
    if(inspection.passed){
     // Second source-version check before issuing review receipt.
     for(const rel of allowedFiles){if(hash(fs.readFileSync(safeFile(root,rel)))!==baseHashes[rel])throw Error('Source changed during review')}
     return makeReceipt('PASSED_AWAITING_HUMAN_REVIEW',record);
    }
    feedback={status:'FAILED',testSha256:inspection.testSha256,summary:typeof inspection.summary==='string'?inspection.summary.slice(0,1000):'Independent test failed'};
   }finally{fs.rmSync(trial,{recursive:true,force:true})}
  }
  return makeReceipt('NO_VERIFIED_PATCH');
  function makeReceipt(status,winner=null){return {schema:'MANA_MODULE_PATCH_REVIEW_V1',status,requestSha256,baseDigest,baseHashes:{...baseHashes},attempts,winningAttempt:winner?.attempt??null,proposedHashes:winner?.sourceHashes??null,testSha256:winner?.testSha256??null,approved:false,humanReviewRequired:true,productionDeploymentAllowed:false,sourceMutated:false}}
 }
 return Object.freeze({review});
}
module.exports={createModulePatchReviewer,hash};
