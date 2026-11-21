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
