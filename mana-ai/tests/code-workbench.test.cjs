'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {draftCode}=require('../src/native/code-workbench.cjs');
function setup(t){const base=fs.mkdtempSync(path.join(os.tmpdir(),'mana-code-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));const projectRoot=path.join(base,'project'),workspace=path.join(base,'private');fs.mkdirSync(projectRoot);fs.mkdirSync(path.join(projectRoot,'src'));fs.writeFileSync(path.join(projectRoot,'src/a.cjs'),'original');return {request:'Write a small pure module according to the request',projectRoot,workspace,allowedFiles:['src/a.cjs','tests/a.test.cjs']};}
test('natural-language code proposal produces real files and bound receipt without executing or editing source',async t=>{
 const args=setup(t),code='throw Error("candidate must not execute");';const result=await draftCode({...args,propose:async input=>{assert.match(input.instruction,/original/);return JSON.stringify({files:[{path:'src/a.cjs',content:code},{path:'tests/a.test.cjs',content:'test proposal'}]});}});
 assert.equal(result.status,'CODE_DRAFT_AWAITING_SANDBOX');assert.equal(result.testsExecuted,false);assert.equal(result.approved,false);assert.equal(fs.readFileSync(path.join(result.directory,'candidate/src/a.cjs'),'utf8'),code);assert.equal(fs.readFileSync(path.join(args.projectRoot,'src/a.cjs'),'utf8'),'original');assert.equal(result.files[0].newSha256.length,64);
 await assert.rejects(draftCode({...args,propose:async()=>''}),/Draft exists/);
});
test('code scope blocks traversal, hidden secrets, symlinks and unexpected files',async t=>{
 for(const name of ['../escape.cjs','/tmp/a.js','.env','src/../../x.js','src\\x.js','node_modules/x.js']){const args=setup(t);await assert.rejects(draftCode({...args,allowedFiles:[name],propose:async()=>''}));}
 const args=setup(t);fs.symlinkSync('/tmp',path.join(args.projectRoot,'linked'));await assert.rejects(draftCode({...args,allowedFiles:['linked/a.js'],propose:async()=>''}),/symlink/);
 await assert.rejects(draftCode({...args,propose:async()=>JSON.stringify({files:[{path:'src/other.cjs',content:'bad'}]})}),/scope/);
});
test('provider absence preserves resumability; source mutation refuses stale candidate',async t=>{
 const args=setup(t);const result=await draftCode({...args,propose:async()=>{throw Error('offline');}});assert.equal(result.status,'DEPENDENCY_UNAVAILABLE');assert.deepEqual(fs.readdirSync(args.workspace),[]);
 await assert.rejects(draftCode({...args,propose:async()=>{fs.writeFileSync(path.join(args.projectRoot,'src/a.cjs'),'changed');return JSON.stringify({files:[{path:'src/a.cjs',content:'new'}]});}}),/Source changed/);
});
