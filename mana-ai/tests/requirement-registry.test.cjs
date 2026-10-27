'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {catalog,validate,backlog}=require('../src/native/requirement-registry.cjs');
test('covers the complete fixed cross-domain requirement list',()=>{const a=catalog();assert.ok(a.length>=30);assert.equal(new Set(a.map(x=>x.id)).size,a.length);assert.ok(['core','aec','business','jarvis','creative','platform'].every(p=>a.some(x=>x.phase===p)));assert.equal(validate(a),true);});
test('rejects false code-completion without evidence and unknown requirements',()=>{const a=catalog();a[0].status='accepted';assert.throws(()=>validate(a),/Evidence/);a[0].evidence=['commit:abcdef012345'];assert.equal(validate(a),true);a[0].id='CORE-999';assert.throws(()=>validate(a),/Unknown/);});
test('backlog is deterministic and does not pretend requirements are complete',()=>{const a=catalog(),x=backlog(a),y=backlog(catalog());assert.equal(x.sha256,y.sha256);assert.equal(x.accepted,0);assert.equal(x.remaining.length,a.length);a[0].status='accepted';a[0].evidence=['manual acceptance record 123'];assert.equal(backlog(a).remaining.length,a.length-1);});
