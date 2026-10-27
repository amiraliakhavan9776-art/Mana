'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {signAttestation,verifyAttestation}=require('../src/native/sandbox-attestation.cjs');
const {createModulePatchReviewer,hash}=require('../src/native/module-patch-review.cjs');
const key=crypto.randomBytes(32);const h=s=>hash(s);
const context={requestSha256:h('request'),testSha256:h('independent tests'),files:[{path:'lib/a.cjs',newSha256:h('candidate')}]};
test('valid attestation is bound to request, tests and candidate',()=>{
 const a=signAttestation({key,context,passed:true,executed:true,sandboxVerified:true});
 assert.equal(verifyAttestation({key,attestation:a,expected:context}),true);
 assert.equal(verifyAttestation({key,attestation:a,expected:{...context,testSha256:h('other')}}),false);
 assert.equal(verifyAttestation({key,attestation:a,expected:{...context,files:[{path:'lib/a.cjs',newSha256:h('tampered')}]}}),false);
});
test('forged or malformed attestations rejected',()=>{
 const a=signAttestation({key,context,passed:false,executed:true,sandboxVerified:true});
 assert.equal(verifyAttestation({key,attestation:{...a,passed:true},expected:context}),false);
 assert.equal(verifyAttestation({key:crypto.randomBytes(32),attestation:a,expected:context}),false);
 assert.throws(()=>signAttestation({key,context,passed:true,executed:false,sandboxVerified:true}));
});
test('module reviewer fails closed on unsigned sandbox claim',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mana-v17-root-'));
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'mana-v17-work-'));fs.chmodSync(work,0o700);
 try{
 fs.writeFileSync(path.join(root,'a.cjs'),'module.exports=1;');
 const original=h('module.exports=1;');
 const reviewer=createModulePatchReviewer({projectRoot:root,workspace:work,attestationKey:key,propose:async()=>({files:[{path:'a.cjs',content:'module.exports=2;'}]}),verify:async()=>({passed:true,executed:true,sandboxVerified:true,testSha256:h('tests')})});
 const result=await reviewer.review({request:'Change module export from 1 to 2',allowedFiles:['a.cjs'],baseHashes:{'a.cjs':original}});
 assert.equal(result.status,'SANDBOX_UNAVAILABLE');assert.equal(result.attempts[0].status,'ATTESTATION_REJECTED');assert.equal(fs.readFileSync(path.join(root,'a.cjs'),'utf8'),'module.exports=1;');
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(work,{recursive:true,force:true})}
});
test('module reviewer accepts signed exact result only for human review',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mana-v17-root-'));
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'mana-v17-work-'));fs.chmodSync(work,0o700);
 try{
 fs.writeFileSync(path.join(root,'a.cjs'),'module.exports=1;');
 const reviewer=createModulePatchReviewer({projectRoot:root,workspace:work,attestationKey:key,propose:async()=>({files:[{path:'a.cjs',content:'module.exports=2;'}]}),verify:async({files,requestSha256})=>{
 const testSha256=h('independent-test-suite');return {passed:true,executed:true,sandboxVerified:true,testSha256,attestation:signAttestation({key,context:{files,requestSha256,testSha256},passed:true,executed:true,sandboxVerified:true})};
 }});
 const result=await reviewer.review({request:'Change module export from 1 to 2',allowedFiles:['a.cjs'],baseHashes:{'a.cjs':h('module.exports=1;')}});
 assert.equal(result.status,'PASSED_AWAITING_HUMAN_REVIEW');assert.equal(result.approved,false);assert.equal(result.productionDeploymentAllowed,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(work,{recursive:true,force:true})}
});
