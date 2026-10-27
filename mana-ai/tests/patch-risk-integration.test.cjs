'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createModulePatchReviewer,hash}=require('../src/native/module-patch-review.cjs');
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-v16-')),root=path.join(dir,'src'),workspace=path.join(dir,'work');fs.mkdirSync(root);fs.mkdirSync(workspace,{mode:0o700});fs.writeFileSync(path.join(root,'module.py'),'def total(x):\n    return x+1\n');const baseHashes={'module.py':hash(fs.readFileSync(path.join(root,'module.py')))};return {root,workspace,baseHashes,close:()=>fs.rmSync(dir,{recursive:true,force:true})}}
for(const [label,content,rule] of [
 ['dynamic execution','eval("1+1")\n','DYNAMIC_EXEC'],
 ['credential access','print(open("/etc/shadow").read())\n','CREDENTIAL_ACCESS'],
 ['network access','requests.get("https://example.org")\n','NETWORK'],
 ['filesystem destruction','shutil.rmtree("/tmp/data")\n','FILESYSTEM_DESTRUCTION']]){
 test(`V16 blocks ${label} before verifier`,async()=>{const f=setup();try{let calls=0;const reviewer=createModulePatchReviewer({projectRoot:f.root,workspace:f.workspace,propose:()=>({files:[{path:'module.py',content}]}),verify:()=>{calls++;return {passed:true,executed:true,sandboxVerified:true,testSha256:hash('test')}}});const r=await reviewer.review({request:'Please repair module implementation',allowedFiles:['module.py'],baseHashes:f.baseHashes});assert.equal(r.status,'MANUAL_SECURITY_REVIEW');assert.equal(r.attempts[0].findings[0].rule,rule);assert.equal(calls,0);assert.equal(r.approved,false);assert.deepEqual(fs.readdirSync(f.workspace),[])}finally{f.close()}})
}
test('V16 clean patch still needs verified independent sandbox',async()=>{const f=setup();try{let calls=0;const reviewer=createModulePatchReviewer({projectRoot:f.root,workspace:f.workspace,propose:()=>({files:[{path:'module.py',content:'def total(x):\n    return x+2\n'}]}),verify:()=>{calls++;return {passed:true,executed:true,sandboxVerified:false,testSha256:hash('test')}}});const r=await reviewer.review({request:'Please repair module implementation',allowedFiles:['module.py'],baseHashes:f.baseHashes});assert.equal(r.status,'SANDBOX_UNAVAILABLE');assert.equal(calls,1)}finally{f.close()}});
