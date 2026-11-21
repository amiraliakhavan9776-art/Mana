'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {discoverPanelEvidence,readCapturedPanelEvidence,INDEX_URL,SOURCE_URL,ID}=require('./aec-source.cjs');
const AT='2026-11-21T11:59:00.000Z';
const indexText=['L10: ## Certified Technician Program Manuals',
  'L11: 【86†2026 Construction Procedures I】','L12: 【88†2026 Construction Procedures II】','L13: ### Contact Information'].join('\n');
const pageText=['AREA OF A TRAPEZOID','Average width times the altitude.','A = B1 + B2','2 × H','where:',
  'B1 = length of Base 1','B2 = length of Base 2','H = altitude height','The sum of the bases, divided by two, times the height.']
  .map((s,i)=>'L'+(80+i)+'@P12: '+s.replace(/^Average/,'average')).join('\n');
function fixture({index={},source={}}={}) {
  const fake={
    index:{url:INDEX_URL,retrievedAt:AT,text:indexText,...index},
    source:{url:SOURCE_URL,parentUrl:INDEX_URL,linkNumber:86,retrievedAt:AT,text:pageText,...source},
  };
  const seen=[];
  return {seen,readPublisher:async request=>{seen.push(request);return request.kind==='index'?fake.index:fake.source;}};
}
test('selects the dynamic unique publisher-link number, never the neighboring revision',async()=>{
  const p=fixture();
  const result=await discoverPanelEvidence({readPublisher:p.readPublisher});
  assert.equal(result.sourceUrl,SOURCE_URL);
  assert.deepEqual(result.evidence.link,{number:86,label:'2026 Construction Procedures I',indexLine:11});
  assert.equal(p.seen[0].url,INDEX_URL);
  assert.equal(p.seen[0].expectedUrl,undefined);
  assert.equal(p.seen[1].link.number,86);
  assert.equal(result.evidence.transport,'HOST_MEDIATED_WITNESSED_LINK');
  assert.equal(result.evidence.directRuntimeNetwork,false);
  assert.equal(result.fit.id,ID);
  assert.equal(result.fit.outputPower,2);
  assert.deepEqual(result.fit.fields.map(x=>[x.id,x.power,x.max]),
    [['base_a_mm',1,100000],['base_b_mm',1,100000],['height_mm',1,100000]]);
  assert.equal(result.evidence.output.denominator,2);
  assert.equal(result.evidence.input.minimum,1);
  const fit=result.fit.examples;
  assert.equal(fit.length,14);
  assert.ok(fit.some(([,result])=>result%2===1));
  assert.ok(fit.every(([inputs,result])=>inputs.every(Number.isSafeInteger)&&Number.isSafeInteger(result)));
});
test('rejects wrong, duplicate, or out-of-scope index matches',async()=>{
  for(const text of [indexText.replace('Procedures I】','Procedures II】'),
    indexText.replace('L12:', 'L12: 【96†2026 Construction Procedures I】\nL13:'),
    indexText.replace('Certified Technician Program Manuals','Unrelated heading')]){
    const p=fixture({index:{text}});
    await assert.rejects(discoverPanelEvidence({readPublisher:p.readPublisher}),/PUBLISHER_LINK_MISSING_OR_AMBIGUOUS/);
    assert.equal(p.seen.length,1);
  }
});
test('rejects a guessed URL, wrong selected link, or noncanonical destination',async()=>{
  for(const source of [{linkNumber:87},{parentUrl:'https://www.in.gov/'},{url:SOURCE_URL+'&other=1'}]){
    await assert.rejects(discoverPanelEvidence({readPublisher:fixture({source}).readPublisher}),/PUBLISHER_(LINK_PROVENANCE|URL)_MISMATCH/);
  }
});
test('requires the numbered PDF page, matching prose, and exact equation meaning',async()=>{
  for(const text of [pageText.replaceAll('@P12','@P13'),pageText.replace('2 × H','3 × H'),
    pageText.replace('B1 + B2','B1 + B1'),pageText.replace('divided by two','divided by three'),
    pageText.replace('L85@P12:', 'L95@P12:'),pageText.replace('H = altitude height','H = slant height')]){
    await assert.rejects(discoverPanelEvidence({readPublisher:fixture({source:{text}}).readPublisher}),/SOURCE_/);
  }
});
test('rejects unavailable/oversized captures and unrecognized transport mode',async()=>{
  await assert.rejects(discoverPanelEvidence(),/PUBLISHER_READER_REQUIRED/);
  await assert.rejects(discoverPanelEvidence({readPublisher:()=>null}),/PUBLISHER_CAPTURE_UNAVAILABLE/);
  await assert.rejects(discoverPanelEvidence({readPublisher:fixture({index:{text:'a'.repeat(100000)}}).readPublisher}),/PUBLISHER_CAPTURE_INVALID/);
  await assert.rejects(discoverPanelEvidence({readPublisher:()=>null,sourceMode:'direct'}),/PUBLISHER_MODE_INVALID/);
  const r=await discoverPanelEvidence({readPublisher:fixture().readPublisher,sourceMode:'pinned-replay'});
  assert.equal(r.evidence.transport,'OPERATOR_PINNED_CAPTURE_REPLAY');
});
const cap=process.env.MANA_INDOT_CAPTURE;
const pin=process.env.MANA_INDOT_CAPTURE_SHA256;
test('real INDOT connector capture replay yields exact page geometry and fit', {skip:!cap||!pin},async()=>{
  const r=await readCapturedPanelEvidence(cap,pin);
  assert.equal(r.evidence.sourceMode,'pinned-replay');
  assert.equal(r.evidence.captureFileSha256,pin);
  assert.equal(r.evidence.link.indexLine,345);
  assert.equal(r.evidence.link.number,270);
  assert.equal(r.evidence.passage.pageIndex,12);
  assert.equal(r.evidence.passage.lineStart,454);
  assert.equal(r.evidence.passage.lineEnd,462);
  assert.equal(r.fit.examples.length,14);
  await assert.rejects(readCapturedPanelEvidence(cap,'0'.repeat(64)),/CAPTURE_PIN_MISMATCH/);
});
