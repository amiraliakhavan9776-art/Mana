'use strict';
// The first six cases reproduce the recorded validator's acceptance intent.
const test = require('node:test');
const assert = require('node:assert/strict');
const {validateContract} = require('../src/native/typed-contracts.cjs');
const schema = {type:'object', required:['text'], properties:{text:{type:'string'}}};
test('valid output accepted', () => assert.equal(validateContract({text:'verified'}, schema).ok, true));
test('numeric output rejected', () => assert.deepEqual(validateContract({text:12345}, schema), {ok:false,path:'$.text',reason:'TYPE_MISMATCH'}));
test('missing field rejected', () => assert.equal(validateContract({}, schema).ok, false));
test('integer excludes boolean', () => assert.equal(validateContract(true,{type:'integer'}).ok,false));
test('nested array checked', () => {
  const s={type:'array',items:schema};
  assert.equal(validateContract([{text:'ok'}],s).ok,true);
  assert.equal(validateContract([{text:42}],s).ok,false);
});
test('null not accepted as object', () => assert.equal(validateContract(null,{type:'object'}).ok,false));
test('invalid schemas and nonfinite numbers are rejected', () => {
  for (const s of [null, [], {type:'unknown'}]) assert.throws(()=>validateContract({},s));
  for (const value of [NaN,Infinity,-Infinity]) assert.equal(validateContract(value,{type:'number'}).ok,false);
  assert.equal(validateContract(Number.MAX_SAFE_INTEGER+1,{type:'integer'}).ok,false);
});
test('required fields must be own properties', () => {
  assert.equal(validateContract(Object.create({text:'inherited'}),schema).reason,'REQUIRED_FIELD_MISSING');
});
test('excessive recursive contracts stop rather than exhaust the stack', () => {
  const value={};value.child=value;
  const s={type:'object',properties:{}};s.properties.child=s;
  assert.throws(()=>validateContract(value,s),/depth/);
});
