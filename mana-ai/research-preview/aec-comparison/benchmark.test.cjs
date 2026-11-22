'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runMana}=require('./run-mana.cjs');
const {grade}=require('./grade.cjs');
const {SOURCE,CASES}=require('./cases.cjs');
const response=()=>runMana({mode:'fixture'});
const evalAnswer=v=>grade(JSON.stringify(v));
const find=(o,id)=>o.results.find(x=>x.id===id);
test('same eight synthetic cases run against MANA exact engine and independent polygon grader',()=>{
 const raw=response();const scores=evalAnswer(raw);
 assert.equal(scores.status,'ALL_CASES_PASSED');
 assert.deepEqual([scores.passed,scores.quantityPassed,scores.abstentionsPassed,scores.tracePassed],[8,4,4,8]);
 assert.equal(find(raw,'T1').areaMm2,'94.5');assert.equal(find(raw,'T1').areaM2,'0.0000945');
 assert.equal(find(raw,'R2').areaMm2,'9999900000');
 assert.equal(find(raw,'U2').reasonCode,'MIXED_UNITS');
 assert.equal(find(raw,'H1').reasonCode,'PERPENDICULAR_HEIGHT_REQUIRED');
 assert.equal(find(raw,'S1').reasonCode,'OUT_OF_SCOPE');
});
test('numeric strings reject Persian digits, units, exponents, rounding and false exactness',()=>{
 for(const invalid of ['۹۴.۵','94.5 mm²','9.45e1','94.50','95','94.500','94,5',94]){
  const raw=response();find(raw,'T1').areaMm2=invalid;
  assert.deepEqual(evalAnswer(raw).rows.find(x=>x.id==='T1').problems,['areaMm2']);
 }
 const malformed=JSON.stringify(response()).replace('"denominator":2','"denominator":2.0');
 assert.equal(grade(malformed).status,'FORMAT_REJECTED');
});
test('wrong input unit and formula/source trace do not earn whole-case credit',()=>{
 const r=response();Object.assign(find(r,'R1'),{inputUnit:'cm',formulaId:'gross-planar-trapezoid-v1',sourceUrl:SOURCE+'?fake=1'});
 const s=evalAnswer(r);
 assert.deepEqual(s.rows[0].problems,['inputUnit','formulaId','sourceUrl']);
 assert.equal(s.tracePassed,7);assert.equal(s.quantityPassed,4);assert.equal(s.passed,7);
});
test('missing, repeated, unknown and extra rows are identified without oracle leakage',()=>{
 const r=response();r.results=r.results.slice(0,7);const s=evalAnswer(r);
 assert.deepEqual(s.rows.at(-1),{id:'S1',passed:false,problems:['MISSING_CASE']});
 assert.equal(s.passed,7);assert.equal(s.abstentionsPassed,3);
 r.results.push({...r.results[0]});assert.equal(evalAnswer(r).code,'DUPLICATE_OR_UNKNOWN_CASE');
 r.results[7].id='Evil';assert.equal(evalAnswer(r).code,'DUPLICATE_OR_UNKNOWN_CASE');
 assert.equal(grade(JSON.stringify(response()).replace('"schema":','"schema": "duplicate","schema":')).code,'EXACT_JSON_REQUIRED');
 const t=response();t.results[4].unverified='should not be a field';
 assert.deepEqual(evalAnswer(t).rows.find(x=>x.id==='U1').problems,['ROW_SCHEMA_INVALID']);
});
test('invented payable quantity fails abstention; JSON fenced output does not silently parse',()=>{
 const r=response();Object.assign(find(r,'S1'),{areaMm2:'8320000',sourceUrl:SOURCE});
 const s=evalAnswer(r);
 assert.equal(s.abstentionsPassed,3);assert.equal(s.rows.at(-1).passed,false);
 assert.equal(grade('~~~json\n'+JSON.stringify(response())+'\n~~~').status,'FORMAT_REJECTED');
});
test('prompt names all cases exactly once and requires explicit source and gross-only policy',()=>{
 const prompt=fs.readFileSync(path.join(__dirname,'PROMPT.fa.txt'),'utf8');
 for(const c of CASES)assert.equal(prompt.split('\n').filter(line=>line.startsWith(c.id+' —')).length,1);
 assert.ok(prompt.includes(SOURCE));assert.match(prompt,/سطح هندسی ناخالص/);
 assert.doesNotMatch(prompt,/94\.5|0\.0000945/);
 const schema=JSON.parse(fs.readFileSync(path.join(__dirname,'answer.schema.json'),'utf8'));
 assert.equal(schema.additionalProperties,false);
 assert.equal(schema.$defs.row.additionalProperties,false);
});
test('verified mode cannot substitute fresh directory and never modifies state on failure',t=>{
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'mana-comparison-empty-'));
 t.after(()=>fs.rmdirSync(workspace));
 assert.throws(()=>runMana({mode:'verified-receipt',workspace,pythonPath:'/usr/bin/python3'}),{code:'NASA_QUANTITY_SOURCE_UNVERIFIED'});
 assert.deepEqual(fs.readdirSync(workspace),[]);
});
const savedLesson=process.env.MANA_BENCH_NASA_TEST_LESSON;
test('exact saved publisher lesson through synthetic wire: original local receipt revalidates all eight', {skip:!savedLesson},async t=>{
 const {createNasaAreaExperiment}=require('../nasa-area-experiment.cjs');
 const {INDEX_URL,AREA_URL}=require('../nasa-area-source.cjs');
 const {EventEmitter}=require('node:events');
 const {createHash}=require('node:crypto');
 const pythonPath='/usr/bin/python3',workspace=fs.mkdtempSync(path.join(os.tmpdir(),'mana-comparison-wire-fixture-'));
 t.after(()=>fs.rmSync(workspace,{recursive:true,force:true}));
 const body=fs.readFileSync(savedLesson);
 const sha=b=>createHash('sha256').update(b).digest('hex');
 assert.equal(sha(body),'ee6cfe639a6dee602af883fb1411fcb5a8a6e46f35be92421fa937ad69180cef');
 const index=Buffer.from('<html><head><title>Index of Aerodynamics Slides</title></head><body><img alt="Label for Math Fundamentals"><a href="area.html">Area</a></body></html>');
 const calls=[];
 const fixtureWire=(url,_,callback)=>{
  calls.push(url);assert.ok(url===INDEX_URL||url===AREA_URL);
  const b=url===INDEX_URL?index:body,q=new EventEmitter();
  q.destroy=()=>{};q.end=()=>setImmediate(()=>{
   const r=new EventEmitter();r.statusCode=200;r.headers={'content-type':'text/html','content-length':String(b.length)};r.complete=true;
   callback(r);r.emit('data',b);r.emit('end');
  });return q;
 };
 const r=await createNasaAreaExperiment({workspace,pythonPath,mode:'direct',request:fixtureWire}).run();
 assert.equal(r.status,'AWAITING_HUMAN_REVIEW');assert.equal(r.passed,16);
 const tree=()=>JSON.stringify(fs.readdirSync(workspace,{recursive:true}).sort().map(f=>{
  const p=path.join(workspace,f);return [f,fs.statSync(p).isDirectory()?null:sha(fs.readFileSync(p))];
 }));
 const before=tree();
 const answer=runMana({mode:'verified-receipt',workspace,pythonPath});
 assert.equal(evalAnswer(answer).passed,8);
 assert.equal(tree(),before);
 assert.deepEqual(calls,[INDEX_URL,AREA_URL]);
});
