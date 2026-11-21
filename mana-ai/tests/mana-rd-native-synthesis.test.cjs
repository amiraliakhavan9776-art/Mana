'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {createNativeRd,runPinnedWorker}=require('../src/pilot/mana-native-rd.cjs'),{verifyFrozen}=require('../src/pilot/mana-native-rd-verifier.cjs');
const node24=Number(process.versions.node.split('.')[0])>=24,master=process.env.MANA_TEST_MASTER;
const catalog=require('../rd-pilot/catalog.json'),packs=path.resolve(__dirname,'../native-rd-pilot'),sha=x=>createHash('sha256').update(x).digest('hex');
const fixture=(area,n)=>JSON.parse(fs.readFileSync(path.join(packs,area,n+'.json')));
function dir(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'mana-rd-native-test-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
test('same pinned process and evaluator pass original and fresh independent suites for both mappings',{skip:!node24},()=>{
 for(const [i,n]of ['floor','volume'].entries()){
  const m=catalog.missions[i],p=fixture('fit-only',n),h=fixture('verify-only',n),r=runPinnedWorker(m);
  const fitSha256=sha(fs.readFileSync(path.join(packs,'fit-only',n+'.json'))),workerSha256=sha(fs.readFileSync(path.join(packs,'native-synth.cjs')));
  const verified=verifyFrozen(r,m,p,h,fitSha256,workerSha256);assert.equal(verified.status,'AWAITING_HUMAN_REVIEW');assert.deepEqual(verified.score.regression,{passed:8,total:8});assert.deepEqual(verified.score.fresh,{passed:16,total:16});assert.equal(r.modelCalls,0);
  const check=x=>verifyFrozen(x,m,p,h,fitSha256,workerSha256);
  assert.equal(check({...r,search:{...r.search,truncated:true}}).status,'TRUNCATED_REFUSED');
  assert.equal(check({...r,search:{...r.search,matchedBehaviorClasses:2}}).status,'AMBIGUOUS_REFUSED');
  assert.throws(()=>check({...r,candidateSha256:'changed'}),/FROZEN_CANDIDATE/);
  const duplicate=structuredClone(h);duplicate.examples[0]=p.examples[0];assert.throws(()=>verifyFrozen(r,m,p,duplicate,fitSha256,workerSha256),/SPLIT_OVERLAP/);
 }
});
test('permission child cannot read another fit pack, verifier labels, or instructions outside exact allowlist',{skip:!node24},t=>{
 const d=dir(t),script=path.join(d,'permission-probe.cjs'),one=path.join(packs,'fit-only','floor.json');
 fs.writeFileSync(script,`const fs=require('node:fs');const [fit,...blocked]=process.argv.slice(2); fs.readFileSync(fit);for(const name of blocked){try{fs.readFileSync(name); process.exitCode=4;}catch(e){if(e.code!=='ERR_ACCESS_DENIED')throw e;}} try{fs.writeFileSync(fit, 'denied');process.exitCode=5;}catch(e){if(e.code!=='ERR_ACCESS_DENIED')throw e;}`);
 const r=spawnSync(process.execPath,['--permission','--allow-fs-read='+script,'--allow-fs-read='+one,script,one,path.join(packs,'fit-only','volume.json'),path.join(packs,'verify-only','floor.json'),path.resolve(__dirname,'../rd-pilot/catalog.json')],{env:{},encoding:'utf8',timeout:3000});
 assert.equal(r.status,0,r.stderr);
});
test('blocks unrelated master bytes without touching workspace',t=>{
 const d=dir(t),outside=dir(t),unrelated=path.join(outside,'master.txt');fs.writeFileSync(unrelated,'unrelated source');const lane=createNativeRd({workspace:d,masterPath:unrelated});
 assert.throws(()=>lane.inspect(),/MASTER_OR_CATALOG_CHANGED/);assert.deepEqual(fs.readdirSync(d),[]);
});
test('actual pinned master: inspect, both run receipts, non-retry, concurrent/stale lock and safe verification resume',{skip:!node24||!master},t=>{
 const workspace=dir(t),make=()=>createNativeRd({workspace,masterPath:master}),lane=make();
 assert.equal(lane.inspect().mission,'net-finish-length-mm');assert.deepEqual(fs.readdirSync(workspace),[]);
 const lock=path.join(workspace,'.lock');fs.writeFileSync(lock,'{}',{mode:0o600});assert.equal(lane.run().status,'UNKNOWN_OR_BUSY');fs.unlinkSync(lock);
 const first=lane.run();assert.equal(first.status,'AWAITING_HUMAN_REVIEW');assert.equal(first.workerRunsThisInvocation,1);
 // Simulate an interruption after freeze in disposable test data only.
 const review=path.join(workspace,'net-finish-length-mm-review.json');fs.unlinkSync(review);assert.equal(make().inspect().status,'RESUME_VERIFICATION');assert.equal(make().run().workerRunsThisInvocation,0);
 assert.equal(make().inspect().mission,'uniform-layer-volume-mm3');assert.equal(make().run().workerRunsThisInvocation,1);assert.equal(make().run().workerRunsThisInvocation,0);assert.equal(make().inspect().status,'COMPLETE');
 fs.unlinkSync(review);fs.unlinkSync(path.join(workspace,'net-finish-length-mm-frozen.json'));assert.throws(()=>make().run(),/ORPHAN_NATIVE_RECEIPT/);
 const partial=dir(t);fs.writeFileSync(path.join(partial,'net-finish-length-mm-claim.json'),'{}',{mode:0o600});assert.equal(createNativeRd({workspace:partial,masterPath:master}).run().status,'UNKNOWN_OUTCOME_NO_RETRY');
});
