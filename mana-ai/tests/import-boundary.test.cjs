'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {prepareReadOnlyExport}=require('../src/import-boundary.cjs');
const project={id:'p1',orgId:'org1',name:'Example'};
const doc={id:'d1',orgId:'org1',projectId:'p1',title:'Schedule',text:'Monday work'};
const sample={schemaVersion:1,projects:[project],documents:[doc]};
test('accepts sanitized organization scoped export',()=>{
 const result=prepareReadOnlyExport(sample,{orgId:'org1'});
 assert.equal(result.projects[0].name,'Example');
 assert.equal(result.documents[0].text,'Monday work');
 assert.ok(Object.isFrozen(result));
});
test('rejects cross organization data and orphan documents',()=>{
 assert.throws(()=>prepareReadOnlyExport(sample,{orgId:'org2'}),/Cross-organization/);
 assert.throws(()=>prepareReadOnlyExport({...sample,documents:[{...doc,projectId:'missing'}]},{orgId:'org1'}),/Orphan/);
});
test('rejects unexpected export fields and malformed schema',()=>{
 assert.throws(()=>prepareReadOnlyExport({...sample,secret:'not allowed'},{orgId:'org1'}),/Invalid export schema/);
 assert.throws(()=>prepareReadOnlyExport({...sample,schemaVersion:2},{orgId:'org1'}),/Invalid export schema/);
});
