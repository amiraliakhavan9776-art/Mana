'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {calculateGrossPlanar,createNasaQuantityReporter}=require('./nasa-quantity-report.cjs');
const {createNasaAreaExperiment}=require('./nasa-area-experiment.cjs');
const {INDEX_URL,AREA_URL}=require('./nasa-area-source.cjs');
const python=process.env.MANA_NASA_PYTHON??'/usr/bin/python3';
const localLesson=process.env.MANA_NASA_REPORT_TEST_LESSON;
const sha=b=>createHash('sha256').update(b).digest('hex');
const rect=(base=3000,height=4000)=>({shape:'rectangle',unit:'mm',base_mm:base,perpendicular_height_mm:height});
const trap=(a=7,b=2,h=3)=>({shape:'trapezoid',unit:'mm',parallel_base_a_mm:a,parallel_base_b_mm:b,perpendicular_height_mm:h});
const sourceError={code:'NASA_QUANTITY_SOURCE_UNVERIFIED'};

function privateDir(t){
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'nasa-quantity-report-'));
 t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;
}
function snapshot(p){
 const rows={};
 function walk(d){
  for(const n of fs.readdirSync(d).sort()){
   const f=path.join(d,n),s=fs.lstatSync(f);
   rows[path.relative(p,f)]=[s.mode,s.ino,s.size,s.mtimeMs,s.isFile()?sha(fs.readFileSync(f)):null];
   if(s.isDirectory())walk(f);
  }
 }
 walk(p);return rows;
}
const cli=(...args)=>spawnSync(process.execPath,[path.join(__dirname,'nasa-quantity-report.cjs'),...args],{encoding:'utf8',timeout:10000});

test('rectangle reuses native gross check with exact SI strings from one square millimeter to full bounds',()=>{
 const a=calculateGrossPlanar(rect());
 assert.equal(a.formula.id,'gross-planar-rectangle-v1');
 assert.equal(a.computationCheck,'NATIVE_EXACT_RECTANGULAR_GROSS_AREA');
 assert.deepEqual(a.quantity,{kind:'gross_planar_area',twiceAreaMm2:'24000000',denominator:2,mm2:'12000000',m2:'12',roundingApplied:false});
 assert.equal(calculateGrossPlanar(rect(1,1)).quantity.m2,'0.000001');
 assert.equal(calculateGrossPlanar(rect(100000,100000)).quantity.m2,'10000');
});
test('trapezoid keeps exact half mm² and verifies unordered bases through shoelace; height is a different role',()=>{
 const a=calculateGrossPlanar(trap());
 assert.equal(a.formula.id,'gross-planar-trapezoid-v1');
 assert.deepEqual(a.quantity,{kind:'gross_planar_area',twiceAreaMm2:'27',denominator:2,mm2:'13.5',m2:'0.0000135',roundingApplied:false});
 assert.equal(a.computationCheck,'INDEPENDENT_INTEGER_SHOELACE');
 assert.deepEqual(calculateGrossPlanar(trap(2,7,3)).quantity,a.quantity);
 assert.equal(calculateGrossPlanar(trap(3,2,7)).quantity.mm2,'17.5');
 assert.equal(calculateGrossPlanar(trap(1,2,1)).quantity.m2,'0.0000015');
 // Equal parallel bases reduce to the independently implemented rectangle.
 assert.deepEqual(calculateGrossPlanar(trap(4321,4321,1234)).quantity,calculateGrossPlanar(rect(4321,1234)).quantity);
});
test('rejects untyped/swapped field names, different units, out-of-range dimensions and all extra scope',()=>{
 for(const field of ['deductions_mm2','excluded_area_mm2','unitPrice','payable','contract','geometry','sourceUrl']){
  assert.throws(()=>calculateGrossPlanar({...trap(),[field]:0}),{code:'NASA_QUANTITY_INPUT_NOT_SUPPORTED'});
 }
 const {perpendicular_height_mm:_,...noHeight}=trap();
 for(const unsupported of [{...noHeight,height_m:3},{...noHeight,slant_height_mm:3},{...noHeight,parallel_base_c_mm:3},
  {...trap(),base_b_m:2},{...trap(),unit:'m'},{...trap(),unit:'cm'},{...trap(),unit:'mm²'},{...trap(),unit:'in'},
  rect(0,1),rect(-1,1),rect(100001,1),rect(1,1.01),rect(1,'1'),rect(1,Infinity),null,
  {...rect(),shape:'engineering-notes'},{...rect(),shape:'__proto__'}])
  assert.throws(()=>calculateGrossPlanar(unsupported),/NASA_QUANTITY_/);
 let getterCalls=0;
 const getter=rect();Object.defineProperty(getter,'base_mm',{get(){getterCalls++;return 1;},enumerable:true});
 assert.throws(()=>calculateGrossPlanar(getter),{code:'NASA_QUANTITY_INPUT_NOT_SUPPORTED'});
 assert.equal(getterCalls,0);
});
test('missing or unverified local proof produces no quantity, claim or workspace mutation',t=>{
 const workspace=privateDir(t),input=trap(),reader=createNasaQuantityReporter({workspace,pythonPath:python});
 assert.throws(()=>reader.report(input),sourceError);
 assert.deepEqual(fs.readdirSync(workspace),[]);
 assert.throws(()=>createNasaQuantityReporter({workspace:path.join(workspace,'absent'),pythonPath:python}),sourceError);
 const r=cli(workspace,python,'markdown',JSON.stringify(input));
 assert.equal(r.status,1);assert.equal(r.stderr,'');
 assert.deepEqual(JSON.parse(r.stdout),{schema:'MANA_NASA_GROSS_QUANTITY_REPORT_V1',status:'ABSTAIN',
  reasonCode:'NASA_QUANTITY_SOURCE_UNVERIFIED',activationAuthorized:false});
 assert.deepEqual(fs.readdirSync(workspace),[]);
});
test('CLI rejects duplicate JSON keys and non-integer unit numerals before opening proof',t=>{
 const workspace=privateDir(t);
 for(const s of ['{"shape":"rectangle","unit":"mm","base_mm":1,"base_mm":2,"perpendicular_height_mm":3}',
  '{"shape":"rectangle","unit":"mm","base_mm":1e2,"perpendicular_height_mm":3}',
  '{"shape":"rectangle","unit":"mm","base_mm":1.0,"perpendicular_height_mm":3}']){
  const r=cli(workspace,python,'json',s);
  assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).reasonCode,'NASA_QUANTITY_INPUT_NOT_SUPPORTED');
 }
 assert.deepEqual(fs.readdirSync(workspace),[]);
});

function fixtureRequest(index,lesson,observed){
 return (url,_,cb)=>{
  observed.push(url);
  const content=url===INDEX_URL?index:url===AREA_URL?lesson:null;
  assert.ok(content,'Unexpected URL');
  const q=new EventEmitter();q.destroy=()=>{};
  q.end=()=>setImmediate(()=>{
   const r=new EventEmitter();r.statusCode=200;r.headers={'content-type':'text/html','content-length':String(content.length)};r.complete=true;
   cb(r);r.emit('data',content);r.emit('end');
  });
  return q;
 };
}
const makeIndex=()=>Buffer.from('<html><head><title>Index of Aerodynamics Slides</title></head><body><img alt="Label for Math Fundamentals"><a href="area.html">Area</a></body></html>');
test('failed publisher-evidence receipt cannot authorize a report; read-only failure leaves it unchanged',async t=>{
 const workspace=privateDir(t),observed=[];
 const initial=createNasaAreaExperiment({workspace,pythonPath:python,mode:'direct',
  request:fixtureRequest(makeIndex(),Buffer.from('<title>Area</title>'),observed)});
 assert.equal((await initial.run()).status,'SOURCE_BLOCKED');
 const before=snapshot(workspace);
 assert.throws(()=>createNasaQuantityReporter({workspace,pythonPath:python}).report(trap()),sourceError);
 assert.deepEqual(snapshot(workspace),before);
 assert.deepEqual(observed,[INDEX_URL,AREA_URL]);
});
test('even a 16/16 valid experiment never substitutes an unreviewed publisher lesson version',async t=>{
 const workspace=privateDir(t),observed=[];
 const fixture=makeIndex(),synthetic=Buffer.from('<title>Area</title><p>The area is the two-dimensional amount of space it occupies. The measure has dimensions of length squared.</p><p>On the slide we have listed the formula to calculate the area of a variety of shapes: The equation for the area of a trapezoid is one half the sum of the top t and bottom b times the height h; A = h * [ t + b ] / 2 The area of a triangle is a different shape.</p>');
 const initial=await createNasaAreaExperiment({workspace,pythonPath:python,mode:'direct',
  request:fixtureRequest(fixture,synthetic,observed)}).run();
 assert.equal(initial.status,'AWAITING_HUMAN_REVIEW');assert.equal(initial.passed,16);
 const before=snapshot(workspace);
 assert.throws(()=>createNasaQuantityReporter({workspace,pythonPath:python}).report(trap()),sourceError);
 assert.deepEqual(snapshot(workspace),before);
 assert.deepEqual(observed,[INDEX_URL,AREA_URL]);
});
test('optional exact saved NASA lesson + synthetic index/transport: real CPU evidence replay then reports with zero writes', {skip:!localLesson},async t=>{
 const workspace=privateDir(t),observed=[],lesson=fs.readFileSync(localLesson);
 assert.equal(sha(lesson),'ee6cfe639a6dee602af883fb1411fcb5a8a6e46f35be92421fa937ad69180cef');
 // This isolated integration fixture exercises direct-profile serialization with a
 // synthetic wire and index. It is not a fresh publisher/network validation.
 const initial=await createNasaAreaExperiment({workspace,pythonPath:python,mode:'direct',
  request:fixtureRequest(makeIndex(),lesson,observed)}).run();
 assert.equal(initial.passed,16);
 const before=snapshot(workspace),fromReadOnly=()=>createNasaQuantityReporter({workspace,pythonPath:python});
 const r=fromReadOnly().report(trap());
 assert.deepEqual(fromReadOnly().report(trap()),r);
 assert.equal(fromReadOnly().report(rect()).report.quantity.m2,'12');
 assert.equal(r.report.quantity.mm2,'13.5');
 assert.equal(r.report.provenance.evidenceSha256,initial.evidenceSha256);
 assert.equal(r.report.provenance.priorTrapezoidExperiment.gradeSha256,initial.gradeSha256);
 assert.equal(r.report.provenance.priorTrapezoidExperiment.scope,'TRAPEZOID_BENCHMARK_ONLY');
 assert.equal(r.report.learnedCandidateUsedForReport,false);
 assert.equal(r.report.productionDeploymentAllowed,false);
 assert.match(r.markdown,/بدون کسورات/);
 assert.match(r.markdown,/گزارش آزمایشی/);
 assert.doesNotMatch(r.markdown,/nasa-quantity-report-/);
 const md=cli(workspace,python,'markdown',JSON.stringify(trap()));
 const json=cli(workspace,python,'json',JSON.stringify(trap()));
 assert.equal(md.status,0);assert.equal(md.stdout,r.markdown);
 assert.equal(json.status,0);assert.deepEqual(JSON.parse(json.stdout),r.report);
 assert.deepEqual(snapshot(workspace),before);
 assert.deepEqual(observed,[INDEX_URL,AREA_URL]);
 fs.appendFileSync(path.join(workspace,'source.json'),' ');
 assert.throws(()=>fromReadOnly().report(trap()),sourceError);
});
