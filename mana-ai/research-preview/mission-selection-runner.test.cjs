'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {APPROVED_MISSION_SELECTION_COMMAND:command,createMissionSelectionRunner:create,supportsMissionSelectionInstruction:supports}=require('./mission-selection-runner.cjs');
const {RESEARCH_MISSION_ID:py,RESEARCH_SUBCASE_ID:pyCase}=require('./queue.cjs');
const {APPROVED_PERSIAN_COMMAND:aecCommand}=require('./persian-intake.cjs');
const {REPOSITORY,COMMIT}=require('./cpython-source.cjs');
const {SOURCE_URL,ID:aecCase}=require('./aec-source.cjs');
const aec='6d213a1b0d0b2a93',master=process.env.MANA_TEST_MASTER;
const queueBytes=fs.readFileSync(path.resolve(__dirname,'../capability-registry/development-queue-v01.json'));
const pin='a'.repeat(64);
function pyPass(){
 return {status:'AWAITING_HUMAN_REVIEW',missionId:py,sourceUrl:'https://github.com/'+REPOSITORY+'/blob/'+COMMIT+'/Doc/library/math.rst',
  sourceMode:'pinned-replay',sourceProvenanceSha256:pin,candidate:pin,bridgeReceiptSha256:pin,passed:16,total:16};
}
function aecPass(){
 return {status:'AWAITING_HUMAN_REVIEW',missionId:aec,sourceUrl:SOURCE_URL,
  sourceMode:'host-mediated',sourceSha256:pin,candidateSha256:pin,gradeSha256:pin,passed:16,total:16};
}
function fixture(opts={}){
 let p=opts.py??null,a=opts.aec??null;
 const dispatched=[];
 const config={
  masterBytes:fs.readFileSync(master),queueBytes,
  cpythonRunner:{
   review(){if(opts.corrupt)throw Error('CORRUPT_RECEIPT');return p;},
   async run(){dispatched.push(py);if(opts.delay)await opts.delay; p=opts.wantPy===undefined?pyPass():opts.wantPy;return pyPass();},
  },
  aecRunner:{
   history(){return a;},
   async run(instruction){assert.equal(instruction,aecCommand);dispatched.push(aec);a=aecPass();return a;},
  },
 };
 return {runner:create(config),config,dispatched,reopen:()=>create(config)};
}
test('reviewed broad command only; no query, target, shell, activation or extra instructions accepted',()=>{
 assert.equal(supports(command),true);
 assert.equal(supports(command.replace('۱٫۱','١.١').replaceAll('ی','ي').replaceAll('ک','ك').replace('مأموریت','ماموریت')),true);
 for(const bad of [undefined,'برو جلو',command+' https://example.org',command+' ls /tmp',command+'\nچیزی را فعال کن',command.replace('فعال نکن','فعال کن'),
  command.replace('یک مأموریت','دو مأموریت'),command.replace('صف پژوهش','صف قرنیز'),'\u202e'+command,command.repeat(10)])assert.equal(supports(bad),false);
 assert.throws(()=>create({queueBytes,masterBytes:Buffer.alloc(50)}),/MASTER_PIN_MISMATCH/);
});
test('actual queue order; one case per click, two receipts, then a read-only explained stop',{skip:!master},async()=>{
 const {runner,dispatched,reopen}=fixture();
 assert.equal(runner.history(),null);
 assert.equal((await runner.run(command+'!')).status,'REJECTED');
 assert.deepEqual(dispatched,[]);
 const one=await runner.run(command);
 assert.equal(one.status,'AWAITING_HUMAN_REVIEW');assert.equal(one.missionId,py);assert.equal(one.caseId,pyCase);
 assert.equal(one.reviewedCount,2);assert.equal(one.validatedCount,1);assert.equal(one.nextCaseId,aecCase);
 assert.equal(one.fullMissionComplete,false);assert.match(one.selectedBecause,/نخستین مورد/);
 assert.deepEqual(dispatched,[py]);assert.equal(reopen().history().candidateSha256,pin);
 const two=await reopen().run(command);
 assert.equal(two.status,'AWAITING_HUMAN_REVIEW');assert.equal(two.missionId,aec);assert.equal(two.caseId,aecCase);
 assert.equal(two.validatedCount,2);assert.equal(two.nextCaseId,null);
 assert.deepEqual(dispatched,[py,aec]);
 for(const stop of [await reopen().run(command),reopen().history()]){
  assert.equal(stop.status,'NO_READY_CASE');assert.equal(stop.activationAuthorized,false);
  assert.deepEqual(stop.completed.map(i=>i.missionId),[py,aec]);assert.match(stop.selectedBecause,/۸۴/);
 }
 assert.deepEqual(dispatched,[py,aec]);
});
test('existing valid prior receipt dispatches only the next case',{skip:!master},async()=>{
 const {runner,dispatched}=fixture({py:pyPass()});assert.equal(runner.history().reused,true);
 assert.equal((await runner.run(command)).missionId,aec);
 assert.deepEqual(dispatched,[aec]);
});
test('lying adapter pass without verified receipt does not produce a handoff; failed/missing/unknown processes do not progress',{skip:!master},async()=>{
 const dishonest=fixture({wantPy:null});
 const r=await dishonest.runner.run(command);
 assert.equal(r.status,'UNKNOWN_OUTCOME');assert.equal(r.validatedCount,0);
 assert.deepEqual(dishonest.dispatched,[py]);
 for(const [receipt,status] of [
  [{...pyPass(),status:'TEST_FAILED',passed:15},'TEST_NOT_PASSED'],
  [{status:'RESEARCH_BLOCKED',missionId:py},'SOURCE_BLOCKED'],
  [{status:'UNKNOWN',missionId:py},'UNKNOWN_OUTCOME'],
 ]){
  const {runner,dispatched}=fixture({py:receipt});
  const a=await runner.run(command);assert.equal(a.status,status);assert.equal(a.validatedCount,0);assert.equal(a.nextCaseId,null);
  assert.deepEqual(dispatched,[]);
 }
});
test('corrupt/foreign and out-of-order receipts never dispatch another case',{skip:!master},async()=>{
 for(const [opts,why] of [
  [{aec:aecPass()},/CASE_SEQUENCE/],
  [{py:{...pyPass(),missionId:aec}},/WRONG_MISSION/],
  [{py:{...pyPass(),bridgeReceiptSha256:'bad'}},/INVALID_TEST_VERDICT/],
  [{corrupt:true},/CORRUPT_RECEIPT/],
 ]){
  const {runner,dispatched}=fixture(opts);
  assert.throws(()=>runner.history(),why);await assert.rejects(runner.run(command),why);assert.deepEqual(dispatched,[]);
 }
});
test('concurrent calls cannot accidentally advance the second case within one click in flight',{skip:!master},async()=>{
 let resolve;const delay=new Promise(r=>{resolve=r});
 const {runner,dispatched}=fixture({delay});
 const one=runner.run(command);
 assert.equal((await runner.run(command)).status,'UNKNOWN_OUTCOME');assert.deepEqual(dispatched,[py]);
 resolve();assert.equal((await one).nextCaseId,aecCase);assert.deepEqual(dispatched,[py]);
});
test('exact direct mode can advance only the AEC case; incomplete or wrong transport proof is blocked',{skip:!master},async()=>{
 const direct={...aecPass(),sourceMode:'direct',transport:'DIRECT_OFFICIAL_HTTPS',directRuntimeNetwork:true};
 const x=fixture({py:pyPass(),aec:direct});
 assert.equal(x.runner.history().status,'NO_READY_CASE');
 assert.deepEqual(x.dispatched,[]);
 for(const broken of [
  {...direct,transport:'HOST_MEDIATED_WITNESSED_LINK'},
  {...direct,directRuntimeNetwork:false},
  {...direct,sourceUrl:'https://example.invalid/other.pdf'},
 ]){
  const y=fixture({py:pyPass(),aec:broken});
  await assert.rejects(y.runner.run(command),/CASE_RECEIPT_INVALID_(?:DIRECT_)?SOURCE/);
  assert.deepEqual(y.dispatched,[]);
 }
 const cpy=fixture({py:{...pyPass(),sourceMode:'direct',transport:'DIRECT_OFFICIAL_HTTPS',directRuntimeNetwork:true}});
 await assert.rejects(cpy.runner.run(command),/CASE_RECEIPT_INVALID_SOURCE/);
 assert.deepEqual(cpy.dispatched,[]);
});
test('direct AEC rejects unbound raw evidence and persists only safe source diagnostics',{skip:!master||Number(process.versions.node.split('.')[0])<24},async t=>{
 const os=require('node:os'),{createAecInstructionRunner}=require('./aec-instruction-runner.cjs');
 const {INDEX_URL}=require('./aec-source.cjs'),{PDF_SHA256,PDF_BYTES}=require('./indot-direct.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mana-direct-receipt-test-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const host=new URL(SOURCE_URL);
 const now='2026-11-21T14:00:00.000Z';
 const proposed=()=>({
  status:'OFFICIAL_SOURCE_VERIFIED',sourceUrl:SOURCE_URL,sourceSha256:PDF_SHA256,fit:{id:aecCase},
  evidence:{
   sourceMode:'direct',transport:'DIRECT_OFFICIAL_HTTPS',directRuntimeNetwork:true,
   captureRepresentation:'AUTHENTICATED_RAW_HTML_AND_PDF',
   index:{url:INDEX_URL,sha256:pin,retrievedAt:now,byteCount:1000},
   source:{url:SOURCE_URL,sha256:PDF_SHA256,retrievedAt:now,byteCount:PDF_BYTES},
   link:{href:host.pathname+host.search,url:SOURCE_URL,sha256:pin},
   passage:{pageIndex:12,sha256:pin,structureSha256:pin,proseSha256:pin},
  },
 });
 const cases=[
  [e=>{e.evidence.transport='HOST_MEDIATED_WITNESSED_LINK';},'INDOT_SOURCE_UNVERIFIED'],
  [e=>{e.evidence.directRuntimeNetwork=false;},'INDOT_SOURCE_UNVERIFIED'],
  [e=>{e.evidence.captureRepresentation='PROVIDER_RENDERED_TEXT_NOT_PDF_BYTES';},'INDOT_SOURCE_UNVERIFIED'],
  [e=>{e.evidence.source.sha256=e.sourceSha256=pin;},'INDOT_SOURCE_UNVERIFIED'],
  [e=>{e.evidence.source.byteCount++;},'INDOT_SOURCE_UNVERIFIED'],
  [e=>{e.evidence.link.href='https://example.invalid/';},'INDOT_SOURCE_UNVERIFIED'],
  [e=>{delete e.evidence.passage.structureSha256;},'INDOT_SOURCE_UNVERIFIED'],
  [()=>{throw Error('private /root/path must not appear');},'INDOT_SOURCE_UNVERIFIED'],
  [()=>{throw Error('INDOT_HTTPS_TIMEOUT');},'INDOT_HTTPS_TIMEOUT'],
  [()=>{throw Error('INDOT_PDF_REVISION_MISMATCH');},'INDOT_PDF_REVISION_MISMATCH'],
  [()=>{throw Error('INDOT_PYMUPDF_REQUIRED');},'INDOT_PYMUPDF_REQUIRED'],
 ];
 for(const [i,[change,expected]] of cases.entries()){
  const workspace=path.join(root,String(i));fs.mkdirSync(workspace,0o700);
  let discovers=0;
  const config={workspace,masterBytes:fs.readFileSync(master),queueBytes,sourceMode:'direct',
   discover(){discovers++;const e=proposed();change(e);return e;},
   learn(){assert.fail('invalid source cannot dispatch learner');},readLearning(){assert.fail('invalid source has no learner');}};
  const first=await createAecInstructionRunner(config).run(aecCommand);
  assert.equal(first.status,'SOURCE_BLOCKED');
  assert.equal(first.sourceFailureCode,expected);
  assert(!JSON.stringify(first).includes('/root/path'));
  assert.deepEqual(fs.readdirSync(workspace).sort(),['claim.json','terminal.json']);
  const reopened=createAecInstructionRunner(config);
  assert.equal(reopened.history().sourceFailureCode,expected);
  assert.equal((await reopened.run(aecCommand)).reused,true);
  assert.equal(discovers,1);
 }
});
