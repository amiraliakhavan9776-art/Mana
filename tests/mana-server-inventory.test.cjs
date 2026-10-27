'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {inventoryServer}=require('../tools/inventory-server.cjs');
test('snapshot inventory parses without loading code and distinguishes absent snapshot dependencies',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-server-index-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'module.cjs'),'const fs=require("node:fs");const x=require("./absent.cjs");const y=require("package-x");fs.writeFileSync("SHOULD_NOT_EXIST","unsafe");function later(){fs.mkdirSync("also-unsafe")}');
 const before=fs.readdirSync(dir),r=inventoryServer(dir);assert.equal(r.fileCount,1);assert.equal(r.files[0].syntaxParsed,true);assert.deepEqual(fs.readdirSync(dir),before);
 assert.deepEqual(r.files[0].imports.map(x=>x.status),['node_builtin','not_in_snapshot','external_package']);assert.deepEqual(r.files[0].effectCandidates.map(x=>x.activation),['top_level_candidate','function_body']);
});
test('snapshot symlinks are denied and malformed syntax remains visible as unparsed evidence',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-server-index-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'bad.cjs'),'function {');const r=inventoryServer(dir);assert.equal(r.syntaxErrorCount,1);assert.equal(r.files[0].syntaxParsed,false);assert.ok(r.files[0].parseError);fs.unlinkSync(path.join(dir,'bad.cjs'));fs.symlinkSync('/etc/hosts',path.join(dir,'linked'));assert.throws(()=>inventoryServer(dir),/symlinks/);
});
