'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {loadApprovedExport}=require('../src/export-loader.cjs');
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-export-'));const file=path.join(dir,'approved.json');try{return fn(file,dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
const payload={schemaVersion:1,projects:[{id:'p1',orgId:'local',name:'Test'}],documents:[{id:'d1',orgId:'local',projectId:'p1',title:'Plan',text:'Approved schedule'}]};
test('loads explicit validated local export',()=>fixture(file=>{fs.writeFileSync(file,JSON.stringify(payload));const data=loadApprovedExport(file,{orgId:'local'});assert.equal(data.projects[0].id,'p1');assert.equal(data.documents[0].id,'d1');}));
test('rejects wrong tenant and oversize exports',()=>fixture(file=>{fs.writeFileSync(file,JSON.stringify(payload));assert.throws(()=>loadApprovedExport(file,{orgId:'other'}),/Cross-organization/);assert.throws(()=>loadApprovedExport(file,{orgId:'local',maxBytes:1}),/Invalid export file/);}));
test('rejects symbolic links and invalid json',()=>fixture((file,dir)=>{fs.writeFileSync(file,'not json');assert.throws(()=>loadApprovedExport(file,{orgId:'local'}));const link=path.join(dir,'link.json');fs.symlinkSync(file,link);assert.throws(()=>loadApprovedExport(link,{orgId:'local'}),/Invalid export file/);}));
