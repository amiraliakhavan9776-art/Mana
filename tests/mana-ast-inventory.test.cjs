'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {analyze}=require('../tools/inventory-ast.cjs');
test('lexical map separates closure names and resolves global reassignment across scripts',()=>{
 const r=analyze('<script>var ACT={};function save(){};(function(){function save(){};ACT["x"]=save;})();</script><script>save=function(){};</script>');
 const definitions=r.events.filter(e=>e.kind==='function'&&e.target==='save');assert.equal(definitions.length,2);assert.notEqual(definitions[0].binding,definitions[1].binding);
 assert.equal(r.events.find(e=>e.kind==='assignment'&&e.target==='save').binding,'global:save');
 assert.equal(r.events.find(e=>e.target==='ACT.x').binding,'global:ACT');
});
test('comments and strings never become registrations or storage writes',()=>{
 const r=analyze('<script>// act("fake",()=>{});\nvar s="localStorage.clear()";act("real",()=>{});</script>');
 assert.deepEqual(r.events.filter(e=>e.kind==='registration').map(e=>e.argument),['real']);assert.equal(r.events.filter(e=>e.kind==='storage').length,0);
});
test('deferred handlers, IIFE writes, branches and dynamic keys remain distinct',()=>{
 const r=analyze('<script>var ACT={},DB={};(function(){ACT.x=function(){DB.items=[];};if(true)ACT.y=1;ACT[key]=2;})();</script>');
 assert.equal(r.events.find(e=>e.target==='ACT.x').activation,'immediate');assert.equal(r.events.find(e=>e.target==='DB.items'&&e.kind==='assignment').activation,'deferred');assert.equal(r.events.find(e=>e.target==='ACT.y').activation,'conditional');assert.ok(r.unresolved.some(e=>e.reason==='computed-assignment'));
});
test('shadowed dispatcher produces a different registration identity and nested data reads are located',()=>{
 const r=analyze('<script>function act(){};var DB={};act("x",function(){return DB.projects.length});(function(act){act("x",()=>{})})(function(){});</script>');
 const calls=r.events.filter(e=>e.kind==='registration');assert.notEqual(calls[0].binding,calls[1].binding);assert.ok(r.events.some(e=>e.kind==='database-reference'&&e.target==='projects'));assert.equal(r.overrideCandidates.length,0);
});
test('syntax errors fail closed instead of publishing incomplete evidence',()=>assert.throws(()=>analyze('<script>function {</script>')));
test('inert HTML comments and raw text do not register executable script events',()=>{
 const r=analyze('<!-- <script>act("comment",()=>{});</script> --><textarea><script>act("text",()=>{});</script></textarea><script>act("actual",()=>{});</script>');
 assert.equal(r.scripts.length,1);assert.deepEqual(r.events.filter(e=>e.kind==='registration').map(e=>e.argument),['actual']);
});
test('structurally proven dispatcher calls join direct handler assignments in one candidate chain',()=>{
 const r=analyze('<script>var ACT={};function act(n,f){ACT[n]=f;}act("save",function(){});(function(){ACT["save"]=function(){};})();</script>');
 const chain=r.overrideCandidates.find(c=>c.identity==='global:ACT:ACT.save');assert.ok(chain);assert.equal(chain.sites.length,2);
});
