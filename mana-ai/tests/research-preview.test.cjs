'use strict';
require('../research-preview/queue.test.cjs');
require('../research-preview/cpython-source.test.cjs');
require('../research-preview/official-https.test.cjs');

if(Number(process.versions.node.split('.')[0])>=24){
 require('../research-preview/receipt.test.cjs');
 require('../research-preview/runner.test.cjs');
}else{
 const {test}=require('node:test');
 const assert=require('node:assert/strict');
 const {createReceiptStore}=require('../research-preview/receipt.cjs');
 test('legacy Node refuses the opt-in preview before opening state',()=>{
  assert.throws(()=>createReceiptStore(),{code:'RECEIPT_NEEDS_NODE_24'});
 });
}
