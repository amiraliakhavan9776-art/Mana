'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');
const {createModulePatchReviewer,hash}=require('../src/native/module-patch-review.cjs');
const {signAttestation}=require('../src/native/sandbox-attestation.cjs');
const key=crypto.randomBytes(32), testDigest=hash('owner trusted suite');
async function scenario({reportedPassed=true,signedPassed=true,reportedTestDigest=testDigest,pinnedTestDigest=testDigest}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mana-v18-root-'));const work=fs.mkdtempSync(path.join(os.tmpdir(),'mana-v18-work-'));fs.chmodSync(work,0o700);
 try{
  fs.writeFileSync(path.join(root,'a.cjs'),'module.exports=1;');
  const reviewer=createModulePatchReviewer({projectRoot:root,workspace:work,attestationKey:key,trustedTestSha256:pinnedTestDigest,
   propose:async()=>({files:[{path:'a.cjs',content:'module.exports=2;'}]}),
   verify:async({files,requestSha256})=>({passed:reportedPassed,executed:true,sandboxVerified:true,testSha256:reportedTestDigest,
    attestation:signAttestation({key,context:{files,requestSha256,testSha256:reportedTestDigest},passed:signedPassed,executed:true,sandboxVerified:true})})});
  const result=await reviewer.review({request:'Safely change the exported module number',allowedFiles:['a.cjs'],baseHashes:{'a.cjs':hash('module.exports=1;')}});
  assert.equal(fs.readFileSync(path.join(root,'a.cjs'),'utf8'),'module.exports=1;');
  return result;
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(work,{recursive:true,force:true})}
}
test('reject signed failure masquerading as successful verifier response',async()=>{const r=await scenario({signedPassed:false});assert.equal(r.status,'SANDBOX_UNAVAILABLE');assert.equal(r.attempts[0].status,'ATTESTATION_REJECTED')});
test('reject signed success masquerading as failed verifier response',async()=>{const r=await scenario({reportedPassed:false});assert.equal(r.status,'SANDBOX_UNAVAILABLE')});
test('reject substituted independent test digest even with valid signature',async()=>{const r=await scenario({reportedTestDigest:hash('weaker test')});assert.equal(r.status,'SANDBOX_UNAVAILABLE');assert.equal(r.attempts[0].status,'TRUSTED_TEST_MISMATCH')});
test('accept exact signed success with caller-pinned test digest for review only',async()=>{const r=await scenario();assert.equal(r.status,'PASSED_AWAITING_HUMAN_REVIEW');assert.equal(r.approved,false)});
test('invalid pinned test digest rejected at construction',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'mana-v18-r-')),work=fs.mkdtempSync(path.join(os.tmpdir(),'mana-v18-w-'));fs.chmodSync(work,0o700);try{assert.throws(()=>createModulePatchReviewer({projectRoot:root,workspace:work,propose:async()=>{},verify:async()=>{},trustedTestSha256:'bad'}),/Invalid trusted test digest/)}finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(work,{recursive:true,force:true})}});
