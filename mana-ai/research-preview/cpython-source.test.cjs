'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {researchFma,ROOT,REPOSITORY,COMMIT,PINS}=require('./cpython-source.cjs');

const input={
  repository:REPOSITORY,commit:COMMIT,path:ROOT,gitBlobSha:PINS[ROOT],
  url:'https://github.com/'+REPOSITORY+'/blob/'+COMMIT+'/'+ROOT,
  retrievedAt:'2026-11-21T11:59:00.000Z',contentBase64:'Zml4dHVyZQ==',
};

test('requires a callback and does not provide transport itself',async()=>{
  await assert.rejects(researchFma(),/OFFICIAL_READER_REQUIRED/);
});
test('missing root stops after the only allowed first request',async()=>{
  const calls=[];
  await assert.rejects(researchFma({readOfficial:async p=>{calls.push(p);}}),/SOURCE_UNAVAILABLE/);
  assert.deepEqual(calls,[ROOT]);
});
test('wrong ref, source URL, path or exact Git blob never advances past root',async()=>{
  for(const bad of [
    {commit:'0'.repeat(40)},{url:'https://example.org/index.rst'},{path:'Doc/library/math.rst'},
    {gitBlobSha:'0'.repeat(40)},{repository:'other/cpython'},
  ]){
    const calls=[];
    await assert.rejects(researchFma({readOfficial:async p=>{calls.push(p);return {...input,...bad}}}),/SOURCE_IDENTITY_MISMATCH/);
    assert.deepEqual(calls,[ROOT]);
  }
});
test('claims of identity do not verify bytes and never advance past root',async()=>{
  const calls=[];
  await assert.rejects(researchFma({readOfficial:async p=>{calls.push(p);return input;}}),/SOURCE_BLOB_MISMATCH/);
  assert.deepEqual(calls,[ROOT]);
});
test('rejects oversized, noncanonical encodings and malformed retrieval time',async()=>{
  for(const bad of ['+', 'a'.repeat(95000), 'Zml4dHVyZQ====']){
    await assert.rejects(researchFma({readOfficial:async()=>({...input,contentBase64:bad})}),/SOURCE_ENCODING_INVALID/);
  }
  await assert.rejects(researchFma({readOfficial:async()=>({...input,retrievedAt:'yesterday'})}),/SOURCE_CAPTURE_TIME_INVALID/);
});

const capturesFile=process.env.MANA_CPYTHON_OFFICIAL_CAPTURES;
function records(){
  assert.ok(path.isAbsolute(capturesFile));
  return JSON.parse(fs.readFileSync(capturesFile));
}
test('real pinned publisher captures resolve the toctree and legacy projection', {skip:!capturesFile},async()=>{
  const data=records(),called=[];
  const result=await researchFma({readOfficial:async p=>{called.push(p);return data[p];}});
  assert.equal(result.status,'OFFICIAL_SOURCE_VERIFIED');
  assert.deepEqual(called,[ROOT,'Doc/library/numeric.rst','Doc/library/math.rst']);
  assert.deepEqual(result.source.links.map(l=>l.tocLine),[50,21]);
  assert.equal(result.source.version,'3.13.5');
  assert.equal(result.source.versionAdded,'3.13');
  assert.equal(result.source.declarationLine,232);
  assert.deepEqual(result.source.parameters,['x','y','z']);
  assert.equal(result.source.relation,'(x * y) + z');
  assert.equal(result.source.directRuntimeNetwork,false);
  assert.equal(result.source.sourceMode,'host-mediated');
  assert.equal(result.source.transport,'HOST_MEDIATED_GITHUB_CONNECTOR');
  assert.match(result.legacyCapture.title,/not an HTTP capture/);
  assert.equal(result.legacyCapture.provenance.sourceUrl,result.source.captures[2].url);
  assert.equal(result.legacyCapture.provenance.sourceSha256,result.source.captures[2].sha256);
  const old=require('./source.cjs').derive(result.legacyCapture);
  assert.equal(old.source.status,'SOURCE_RELATION_EXTRACTED');
  assert.equal(old.training.examples.length,14);
});
test('missing second page fails closed after authentic first selection', {skip:!capturesFile},async()=>{
  const data=records(),called=[];
  await assert.rejects(researchFma({readOfficial:async p=>{called.push(p);return p===ROOT?data[p]:null;}}),/SOURCE_UNAVAILABLE/);
  assert.deepEqual(called,[ROOT,'Doc/library/numeric.rst']);
});
test('authentic path survives but tampered final relation is blocked', {skip:!capturesFile},async()=>{
  const data=records(),called=[];
  const last='Doc/library/math.rst';
  const row=data[last];
  const changed=Buffer.from(row.contentBase64,'base64').toString('utf8').replace('(x * y) + z','(x * y) - z');
  row.contentBase64=Buffer.from(changed).toString('base64');
  await assert.rejects(researchFma({readOfficial:async p=>{called.push(p);return data[p];}}),/SOURCE_BLOB_MISMATCH/);
  assert.deepEqual(called,[ROOT,'Doc/library/numeric.rst',last]);
});

test('capture provenance accurately distinguishes each configured acquisition mode', {skip:!capturesFile},async()=>{
 const data=records();
 for(const [sourceMode,transport,directRuntimeNetwork] of [
  ['host-mediated','HOST_MEDIATED_GITHUB_CONNECTOR',false],
  ['pinned-replay','PINNED_LOCAL_REPLAY',false],
  ['official-https','OFFICIAL_CPYTHON_HTTPS',true],
 ]){
  const proof=await researchFma({sourceMode,readOfficial:async p=>data[p]});
  assert.deepEqual({sourceMode:proof.source.sourceMode,transport:proof.source.transport,directRuntimeNetwork:proof.source.directRuntimeNetwork},
    {sourceMode,transport,directRuntimeNetwork});
 }
});
test('unknown source mode fails before reading anything',async()=>{
 const called=[];
 await assert.rejects(researchFma({sourceMode:'unsupported',readOfficial:async p=>called.push(p)}),/SOURCE_MODE_REJECTED/);
 assert.deepEqual(called,[]);
});
