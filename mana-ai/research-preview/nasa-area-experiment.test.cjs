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
test('unrelated legacy anchors may close implicitly without weakening the Area candidate', {skip:!hasPython},async()=>{
 const openNamed='<a name="bookmarks">';
 const raw=index(openNamed+'<font>Math topics</font><a href="volume.html">Volume '+link);
 const calls=[];
 const data=await discoverNasaArea({mode:'pinned-capture',pythonPath:python,reader:replay(calls,raw,lesson())});
 assert.deepEqual(calls,[{kind:'index',url:INDEX_URL},{kind:'selected-link',url:AREA_URL}]);
 assert.equal(data.link.href,'area.html');
});
test('nested, unclosed and crossing Area candidates stop discovery at the index', {skip:!hasPython},async()=>{
 const cases=[
  index('<a href="area.html">Ar<a href="other">Other</a>'+link),
  index('<a href="other">Area<a href="volume.html">Volume</a>'+link),
  index('<a href="area.html">Area<img alt="Label for Analysis"></a>'),
  index(link+'<a href="area.html">Area'), // An unclosed competing actual link is not ignored.
  index('<a href="area.html">Area<img alt="Label for Math Fundamentals"></a>'+link,'Analysis'),
  index('<a href="area.html">Ar<a hidden>ignored</a>ea</a>'),
  index('<a href=" area.html "><a href="Volume.html">Other</a>'+link),
 ];
 for(const raw of cases){
  const calls=[];
  await assert.rejects(discoverNasaArea({mode:'pinned-capture',pythonPath:python,reader:replay(calls,raw,lesson())}),
   e=>e.sourceStage==='index'&&e.message==='NASA_LINK_MALFORMED');
  assert.deepEqual(calls,[{kind:'index',url:INDEX_URL}]);
 }
});

test('legacy lesson navigation anchors outside paragraphs do not suppress unchanged proof', {skip:!hasPython},async()=>{
 const calls=[];
 const clean=lesson();
 const oldNav='<table><tr><td><a name="menu"><font>Navigation</font><a href="other.html">Other</a></td></tr></table>';
 const raw=clean.replace('<body>','<body>'+oldNav).replace('The measure','<a href="area-units.html">The measure</a>');
 const data=await discoverNasaArea({mode:'pinned-capture',pythonPath:python,reader:replay(calls,index(link),raw)});
 assert.deepEqual(calls,[{kind:'index',url:INDEX_URL},{kind:'selected-link',url:AREA_URL}]);
 assert.equal(data.fit.examples[0][1],48);
});
test('lesson legacy repair cannot produce or supply malformed paragraph evidence', {skip:!hasPython},async()=>{
 const docs=[
  [lesson(prose+' A = h * [ <a href="side.html">t<a hidden>ignore</a> + b ] / 2</a> '+end),'NASA_LINK_MALFORMED'],
  [lesson(prose+' <a href="side.html">'+formula+' '+end),'NASA_LINK_MALFORMED'],
  [lesson().replace('<p>'+context,'<a href="unclosed.html"><p>'+context),'NASA_LINK_MALFORMED'],
  [lesson().replace('<p>'+metadata,'<a href="unclosed.html"><p>'+metadata).replace(metadata+'</p>',metadata+'</p></a>'),'NASA_PLANAR_PRECEDING_EVIDENCE_MISSING'],
  [lesson(prose+' <a hidden href="side.html">'+formula+'</a> '+end),'NASA_TRAPEZOID_CLAUSE_NOT_SUPPORTED'],
 ];
 for(const [raw,code] of docs){
  const calls=[];
  await assert.rejects(discoverNasaArea({mode:'pinned-capture',pythonPath:python,reader:replay(calls,index(link),raw)}),
   e=>e.sourceStage==='selected-link'&&e.message===code);
  assert.equal(calls.length,2);
 }
});

test('planar scope diagnostics distinguish preceding layout, paragraph prefix and forbidden scope without new acceptance',{skip:!canLearn},async t=>{
 const payload='PRIVATE_WORD_MUST_NOT_APPEAR';
 const shape=prose+' '+formula+' '+end;
 const cases=[
  [lesson(shape, 'Dimensions were not documented. '+payload),'NASA_PLANAR_PRECEDING_EVIDENCE_MISSING',false,false],
  [lesson('Adjacent note. '+metadata+' '+shape,'Dimensions were not documented. '+payload),'NASA_PLANAR_PRECEDING_EVIDENCE_MISSING',true,false],
  [lesson(shape).replace(context,'Other paragraph prefix. '+payload+' '+context),'NASA_PLANAR_PARAGRAPH_PREFIX_MISSING',false,true],
  [lesson('Use this for contractual net pay quantity. '+shape+' '+payload),'NASA_PLANAR_FORBIDDEN_SCOPE',false,false],
 ];
 for(const [raw,code,cue,later] of cases){
  const [workspace,captureDir]=dirs(t);
  const i=Buffer.from(index(link)),a=Buffer.from(raw);
  for(const [n,b] of [['index.html',i],['area.html',a]])fs.writeFileSync(path.join(captureDir,n),b);
  const o={workspace,captureDir,mode:'pinned-capture',pythonPath:python,indexSha256:sha(i),areaSha256:sha(a)};
  const x=await createNasaAreaExperiment(o).run();
  assert.equal(x.status,'SOURCE_BLOCKED');assert.equal(x.sourceFailureCode,code);
  assert.equal(x.sourceFailureStage,'selected-link');
  assert.deepEqual(x.scopeDiagnostics,{matchingDimensionCueInClause:cue,openingSentenceLaterInClause:later,priorCleanParagraphCount:1});
  assert(!JSON.stringify(x).includes(payload));
  const saved=fs.readFileSync(path.join(workspace,'terminal.json'),'utf8');
  assert(!saved.includes(payload));
  assert.deepEqual(fs.readdirSync(workspace).sort(),['claim.json','terminal.json']);
  assert.deepEqual(createNasaAreaExperiment(o).history().scopeDiagnostics,x.scopeDiagnostics);
 }
});

const rectangleWords='The area of a rectangle is equal to the height <b>h</b> times the base <b>b</b>;';
const triangleWords='The area of a triangle is equal to one half of the base <b>b</b> times the height <b>h</b>;';
const splitArea=(sections=[metadata,context+' '+rectangleWords,'A = h * b',prose,formula,triangleWords])=>
 '<html><head><title>Area</title></head><body><div>'+sections.map(s=>'<p>'+s+'</p>').join('\n')+'</div></body></html>';
test('split profile obtains all six real sibling paragraphs; independent grading stays 16/16',{skip:!canLearn},async t=>{
 const [workspace,captureDir]=dirs(t);
 const i=Buffer.from(index(link)),a=Buffer.from(splitArea());
 for(const [n,b] of [['index.html',i],['area.html',a]])fs.writeFileSync(path.join(captureDir,n),b);
 const o={workspace,captureDir,mode:'pinned-capture',pythonPath:python,indexSha256:sha(i),areaSha256:sha(a)};
 const r=await createNasaAreaExperiment(o).run();
 assert.equal(r.status,'AWAITING_HUMAN_REVIEW');assert.equal(r.passed,16);assert.equal(r.activationAuthorized,false);
 const saved=JSON.parse(fs.readFileSync(path.join(workspace,'source.json')));
 assert.equal(saved.planar.profile,'split-adjacent-sibling-paragraphs');
 assert.match(saved.planar.splitSha256,/^[a-f0-9]{64}$/);
});
test('split math proof cannot bridge hidden, tainted, unrelated or foreign sibling rows',{skip:!hasPython},async()=>{
 const clean=splitArea(), contexts=[
  clean.replace('<p>'+formula,'<p hidden>Do not join this row.</p><p>'+formula),
  clean.replace('<p>'+formula,'<div hidden>Different context</div><p>'+formula),
  clean.replace('<p>'+formula,'<p>Irrelevant middle paragraph.</p><p>'+formula),
  clean.replace('<p>'+formula,'<img src="another-diagram.png" alt="Intervening concept"><p>'+formula),
  clean.replace('<p>'+formula,'<input type="text"><p>'+formula),
  clean.replace('<p>'+formula,'<span aria-hidden="true"></span><p>'+formula),
  clean.replace('<p>'+formula,'<p><img src="formula-context.png">'+formula),
  clean.replace('<p>'+formula,'<p></p><p>'+formula),
  clean.replace('<p>'+formula,'<aside><p>'+formula).replace(formula+'</p>',formula+'</p></aside>'),
  clean.replace('<p>'+formula,'</div><div><p>'+formula),
  clean.replace('<p>'+formula,'<p><a href="unfinished">'+formula),
  clean.replace('<p>'+formula,'<p><span hidden>Fake</span>'+formula),
  clean.replace('A = h * b','A = b * t'),
  clean.replace(triangleWords,'The area of a circle:'),
  clean.replace(formula,formula.replace('/ 2','/ 3')),
  clean.replace(formula,formula.replace('h *','t *')),
  clean.replace(triangleWords,triangleWords+' For net pay quantity.'),
  clean.replace('<p>'+triangleWords,'<p>'+prose+'</p><p>'+triangleWords),
 ];
 for(const raw of contexts){
  const calls=[];
  await assert.rejects(discoverNasaArea({mode:'pinned-capture',pythonPath:python,reader:replay(calls,index(link),raw)}),
   e=>e.sourceStage==='selected-link');
  assert.equal(calls.length,2);
 }
});

const centeredArea=(rectangleCenter='<CENTER><p>A = h * b</p></CENTER>',trapezoidCenter='<CENTER><p>'+formula+'</p></CENTER>')=>
 '<html><head><title>Area</title></head><body><div><p>'+metadata+'</p><p>'+context+' '+rectangleWords+'</p>\n'+
 rectangleCenter+'\n<p>'+prose+'\n'+trapezoidCenter+'\n<p>'+triangleWords+
 '\n<CENTER><p>A = .5 * b * h</p></CENTER></div></body></html>';
test('legacy attribute-free isolated equation centers preserve physical proof and implicit prose endings',{skip:!hasPython},async()=>{
 const calls=[];
 const info=await discoverNasaArea({mode:'pinned-capture',pythonPath:python,reader:replay(calls,index(link),centeredArea())});
 assert.deepEqual(calls,[{kind:'index',url:INDEX_URL},{kind:'selected-link',url:AREA_URL}]);
 assert.equal(info.planar.profile,'split-adjacent-sibling-paragraphs');
 assert.equal(info.fit.examples[0][1],48);
});
test('center flattening is barred by any attributes, extra content, hidden markers, wrong roles, or missing closures',{skip:!hasPython},async()=>{
 for(const raw of [
  centeredArea(undefined,'<CENTER class="formula"><p>'+formula+'</p></CENTER>'),
  centeredArea(undefined,'<CENTER hidden><p>'+formula+'</p></CENTER>'),
  centeredArea(undefined,'<CENTER><p id="formula">'+formula+'</p></CENTER>'),
  centeredArea(undefined,'<CENTER><p aria-hidden="true">'+formula+'</p></CENTER>'),
  centeredArea(undefined,'<CENTER>unrelated<p>'+formula+'</p></CENTER>'),
  centeredArea(undefined,'<CENTER><p>'+formula+'</p>trailer</CENTER>'),
  centeredArea(undefined,'<CENTER><p>'+formula+'</p><!-- hidden alternative --></CENTER>'),
  centeredArea(undefined,'<CENTER><p><?decoy?>'+formula+'</p></CENTER>'),
  centeredArea(undefined,'<CENTER><p><!DOCTYPE html>'+formula+'</p></CENTER>'),
  centeredArea(undefined,'<CENTER><p>'+formula+'</p><p>extra</p></CENTER>'),
  centeredArea(undefined,'<CENTER><p><b>'+formula+'</b></p></CENTER>'),
  centeredArea(undefined,'<CENTER><p>'+formula+'</CENTER>'),
  centeredArea(undefined,'<CENTER><p>'+formula+'</p>'),
  centeredArea(undefined,'</div><div><CENTER><p>'+formula+'</p></CENTER>'),
  centeredArea('<CENTER><p>A = t * b</p></CENTER>'),
  centeredArea(undefined,'<CENTER><p>'+formula.replace('h *','t *')+'</p></CENTER>'),
  centeredArea(undefined,'<CENTER><p>'+formula.replace('/ 2','/ 3')+'</p></CENTER>'),
 ]){
  const calls=[];
  await assert.rejects(discoverNasaArea({mode:'pinned-capture',pythonPath:python,reader:replay(calls,index(link),raw)}),
   e=>e.sourceStage==='selected-link');
  assert.equal(calls.length,2);
 }
});
