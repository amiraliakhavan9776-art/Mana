'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{EventEmitter}=require('node:events'),{createHash}=require('node:crypto');
const {INDEX_URL,AREA_URL,discoverNasaArea,fetchNasa}=require('./nasa-area-source.cjs');
const {createNasaAreaExperiment}=require('./nasa-area-experiment.cjs');
const python=process.env.MANA_NASA_PYTHON??'/usr/bin/python3';
const hasPython=spawnSync(python,['--version'],{timeout:1000}).status===0;
const canLearn=hasPython&&Number(process.versions.node.split('.')[0])>=24;
const sha=b=>createHash('sha256').update(b).digest('hex');
const NOW='2026-11-21T21:00:00.000Z';
const index=(inner,section='Math Fundamentals')=>
 '<html><head><title>Index of Aerodynamics Slides</title></head><body><img alt="Label for '+section+'">'+inner+'</body></html>';
const link='<a href="area.html">Area</a>';
const metadata='The area is the two-dimensional amount of space it occupies. The measure has dimensions of length squared.';
const context='On the slide we have listed the formula to calculate the area of a variety of shapes:';
const prose='The equation for the area of a trapezoid is one half the sum of the top <b>t</b> and bottom <b>b</b> times the height <b>h</b>;';
const formula='A = h * [ t + b ] / 2';
const end='The area of a triangle is a different shape.';
const lesson=(clause=prose+' '+formula+' '+end,scope=metadata,extra='')=>
 '<html><head><title>Area</title>'+extra+'</head><body><p>'+scope+'</p><p>'+context+' '+clause+'</p></body></html>';
function replay(calls,idx,doc){
 return async req=>{
  calls.push({kind:req.kind,url:req.url});
  return {url:req.url,bytes:Buffer.from(req.kind==='index'?idx:doc),retrievedAt:null};
 };
}
test('new source follows only the reviewed Math Fundamentals Area link; exact visible semantics supply fit labels', {skip:!hasPython},async()=>{
 const calls=[];
 const data=await discoverNasaArea({mode:'pinned-capture',pythonPath:python,reader:replay(calls,index('<a href="volume.html">Volume</a>'+link),lesson())});
 assert.deepEqual(calls,[{kind:'index',url:INDEX_URL},{kind:'selected-link',url:AREA_URL}]);
 assert.equal(data.link.section,'Math Fundamentals');assert.equal(data.planar.output.denominator,2);
 assert.equal(data.fit.examples.length,14);
 assert.equal(data.fit.examples[0][1],48);
 assert.deepEqual(data.fit.fields.map(i=>i.id),['base_a_mm','base_b_mm','height_mm']);
 assert.notEqual(data.index.sha256,data.source.sha256);
});
test('wrong, ambiguous, hidden and out-of-context index links cannot reach the lesson', {skip:!hasPython},async()=>{
 for(const body of [
  index(link,'Analysis'),index(link+link),index('<span hidden>'+link+'</span>'),
  index('<a href="https://example.invalid/area.html">Area</a>'),
  index('<a href="area.html?private=1">Area</a>'),
  index('<img alt="Label for Analysis">'+link),
 ]){
  const calls=[];
  await assert.rejects(discoverNasaArea({mode:'pinned-capture',pythonPath:python,reader:replay(calls,body,lesson())}),e=>e.sourceStage==='index');
  assert.deepEqual(calls,[{kind:'index',url:INDEX_URL}]);
 }
});
test('hidden, unrelated, contradictory and wrong-quantity clauses fail closed', {skip:!hasPython},async()=>{
 for(const wrong of [
  lesson(prose+' <script>'+formula+'</script> '+end),
  lesson(prose+' <span hidden>'+formula+'</span> '+end),
  lesson(prose+' <span style="display/**/:none !important">'+formula+'</span> '+end),
  lesson(prose+' <span style="display:none" style="display:inline">'+formula+'</span> '+end),
  lesson(prose+' <span class="hide">'+formula+'</span> '+end,metadata,'<style>.hide{display:none}</style>'),
  lesson(prose+' <!--'+formula+'--> '+end),
  lesson(prose.replace('area of a trapezoid','area of a triangle')+' '+formula+' '+end),
  lesson(prose+' '+formula.replace('/ 2','/ 3')+' '+end),
  lesson(prose+' '+formula.replace('h *','t *')+' '+end),
  lesson('Use this for contractual net pay quantity. '+prose+' '+formula+' '+end),
  lesson(prose+' '+formula+' '+end,'This describes volume and has dimensions of length cubed.'),
 ]){
  const calls=[];
  await assert.rejects(discoverNasaArea({mode:'pinned-capture',pythonPath:python,reader:replay(calls,index(link),wrong)}),e=>e.sourceStage==='selected-link');
  assert.equal(calls.length,2);
 }
});
test('bounded HTTPS refuses other origins, redirects and partial bodies',async()=>{
 function mock(status,headers,complete){
  return (url,opts,cb)=>{
   assert.equal(url,INDEX_URL);assert.equal(opts.method,'GET');assert.equal(opts.rejectUnauthorized,true);
   const q=new EventEmitter();q.destroy=()=>{};
   q.end=()=>setImmediate(()=>{
    const r=new EventEmitter();r.statusCode=status;r.headers=headers;r.complete=complete;
    cb(r);r.emit('data',Buffer.from('x'));r.emit('end');
   });return q;
  };
 }
 await assert.rejects(fetchNasa('https://example.invalid/',()=>assert.fail('out-of-scope dispatch')),/URL_NOT_APPROVED/);
 await assert.rejects(fetchNasa(INDEX_URL,mock(302,{location:AREA_URL},true)),/STATUS_REJECTED/);
 await assert.rejects(fetchNasa(INDEX_URL,mock(200,{'content-type':'text/html','content-length':'9000000'},true)),/BODY_REJECTED/);
 await assert.rejects(fetchNasa(INDEX_URL,mock(200,{'content-type':'text/html','content-length':'10'},false)),/INCOMPLETE/);
});
function dirs(t){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'mana-nasa-area-test-'));
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 return ['state','captures'].map(n=>{const p=path.join(base,n);fs.mkdirSync(p,0o700);return p;});
}
test('synthetic replay only: real isolated learner + independent CPU grader, immutable reuse and corrupt evidence halt',{skip:!canLearn},async t=>{
 const [workspace,captureDir]=dirs(t);
 const i=Buffer.from(index(link)),a=Buffer.from(lesson());
 for(const [n,b] of [['index.html',i],['area.html',a]])fs.writeFileSync(path.join(captureDir,n),b);
 const o={workspace,captureDir,mode:'pinned-capture',pythonPath:python,indexSha256:sha(i),areaSha256:sha(a)};
 const runner=createNasaAreaExperiment(o);
 assert.equal(runner.history(),null);assert.deepEqual(fs.readdirSync(workspace),[]);
 const first=await runner.run();
 assert.equal(first.status,'AWAITING_HUMAN_REVIEW');assert.equal(first.passed,16);
 assert.equal(first.activationAuthorized,false);assert.equal(first.productionDeploymentAllowed,false);
 assert.equal(first.sourceMode,'pinned-capture');
 const term=path.join(workspace,'terminal.json'),bytes=fs.readFileSync(term);
 fs.unlinkSync(path.join(captureDir,'area.html')); // No new acquisition on a verified replay.
 const replayed=await createNasaAreaExperiment(o).run();
 assert.equal(replayed.reused,true);assert.equal(replayed.candidateSha256,first.candidateSha256);
 assert.deepEqual(fs.readFileSync(term),bytes);
 fs.appendFileSync(path.join(workspace,'source.json'),' ');
 await assert.rejects(createNasaAreaExperiment(o).run(),/NASA_RECEIPT_EVIDENCE_MISMATCH/);
});
test('malformed source stops before learner and persists its failure without a second acquisition',{skip:!canLearn},async t=>{
 const [workspace,captureDir]=dirs(t);
 const i=Buffer.from(index(link)),a=Buffer.from(lesson(prose+' hidden formula'));
 for(const [n,b] of [['index.html',i],['area.html',a]])fs.writeFileSync(path.join(captureDir,n),b);
 const o={workspace,captureDir,mode:'pinned-capture',pythonPath:python,indexSha256:sha(i),areaSha256:sha(a)};
 const r=await createNasaAreaExperiment(o).run();
 assert.equal(r.status,'SOURCE_BLOCKED');assert.equal(r.sourceFailureStage,'selected-link');
 assert.equal(r.activationAuthorized,false);
 assert.deepEqual(fs.readdirSync(workspace).sort(),['claim.json','terminal.json']);
 fs.unlinkSync(path.join(captureDir,'index.html'));
 const old=await createNasaAreaExperiment(o).run();
 assert.equal(old.reused,true);assert.equal(old.sourceFailureCode,r.sourceFailureCode);
});
test('missing outer terminal after durable claim remains unknown and cannot reacquire or refit',{skip:!canLearn},async t=>{
 const [workspace,captureDir]=dirs(t);
 const i=Buffer.from(index(link)),a=Buffer.from(lesson());
 for(const [n,b] of [['index.html',i],['area.html',a]])fs.writeFileSync(path.join(captureDir,n),b);
 const o={workspace,captureDir,mode:'pinned-capture',pythonPath:python,indexSha256:sha(i),areaSha256:sha(a)};
 assert.equal((await createNasaAreaExperiment(o).run()).status,'AWAITING_HUMAN_REVIEW');
 const retained=['claim.json','source.json','learner/claim.json','learner/fit-only.json','learner/frozen.json','learner/terminal.json'];
 const copies=retained.map(n=>fs.readFileSync(path.join(workspace,n)));
 // A test tombstone exercises missing terminal semantics, not a simulated power loss.
 fs.unlinkSync(path.join(workspace,'terminal.json'));
 fs.unlinkSync(path.join(captureDir,'index.html'));fs.unlinkSync(path.join(captureDir,'area.html'));
 const reopened=createNasaAreaExperiment(o);
 assert.equal(reopened.history().status,'UNKNOWN_OUTCOME');
 assert.equal((await reopened.run()).status,'UNKNOWN_OUTCOME');
 assert(!fs.existsSync(path.join(workspace,'terminal.json')));
 assert.deepEqual(retained.map(n=>fs.readFileSync(path.join(workspace,n))),copies);
});
