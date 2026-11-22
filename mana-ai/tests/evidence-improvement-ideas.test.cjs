'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {proposeEvidenceImprovementIdeas:propose}=require('../src/native/evidence-improvement-ideas.cjs');
const family={source:'source-verification',recovery:'receipt-recovery',jarvis:'jarvis-availability',campaign:'campaign-coverage'};
const id=n=>n.toString(16).padStart(64,'0');
function row(n,f,o,affectedCount=1,sampleCount=1,assessment='CONFIRMED_GAP'){
 return {evidenceId:id(n),family:family[f],outcome:o,sampleCount,affectedCount,assessment};
}
function input(observations=[],priorIdeaIds=[]){
 return {trustedEvidence:{schema:'MANA_REVIEWED_EVIDENCE_SNAPSHOT_V1',observations},priorIdeaIds};
}
test('ranks supported ideas distinctly, carries only verified evidence and an offline test',()=>{
 const rows=[
  row(1,'source','SOURCE_UNREACHABLE',3,3),
  row(2,'jarvis','WRONG_AVAILABILITY',2,7),
  row(3,'recovery','UNKNOWN_AFTER_INTERRUPT',1,5),
  row(4,'source','SOURCE_SCOPE_MISMATCH',3,7),
  row(5,'recovery','REPLAY_RECEIPT_MISMATCH',1,6),
 ];
 const result=propose(input(rows));
 assert.equal(result.status,'IDEAS_PENDING_REVIEW');
 assert.deepEqual(result.ideas.map(x=>x.evidence.id),[3,5,4,2,1].map(id));
 assert.deepEqual(result.ideas.map(x=>x.rank),[1,2,3,4,5]);
 assert.ok(result.ideas.every(i=>i.reviewRequired&&i.leastNextAcceptanceTest.mode==='OFFLINE_SYNTHETIC_ONLY'));
 assert.equal(result.actionsExecuted,0);assert.equal(result.modelCalls,0);
 assert.equal(result.activationAuthorized,false);assert.equal(result.modelTrainingPerformed,false);
 assert.equal(result.productionDeploymentAllowed,false);
 assert.deepEqual(propose(input([...rows].reverse())),result);
});
test('never invents issues for successful, empty, expected negative or no-common-slot evidence',()=>{
 const ok=[
  row(1,'source','VERIFIED',0,2,'EXPECTED_BEHAVIOR'),
  row(2,'recovery','UNKNOWN_AFTER_INTERRUPT',0,1,'EXPECTED_BEHAVIOR'),
  row(3,'jarvis','NO_COMMON_AVAILABILITY',0,1,'EXPECTED_BEHAVIOR'),
 ];
 for(const rows of [[],ok]){
  const result=propose(input(rows));
  assert.equal(result.status,'NO_NEW_ACTIONABLE_IDEAS');
  assert.deepEqual(result.ideas,[]);
 }
});
test('same idea has a stable ID, selects one strongest observation, and dedups against history',()=>{
 const a=row(10,'source','SOURCE_UNREACHABLE',3,4);
 const b=row(11,'source','SOURCE_UNREACHABLE',3,3);
 const c=row(12,'source','SOURCE_UNREACHABLE',1,1);
 const first=propose(input([a])).ideas[0];
 const out=propose(input([a,c,b]));
 assert.equal(out.ideas.length,1);
 const last=out.ideas[0];
 assert.equal(last.id,first.id);
 assert.equal(last.evidence.id,b.evidenceId);
 assert.equal(last.evidence.sampleCount,3);
 assert.equal(last.evidence.affectedCount,3);
 assert.equal(last.evidence.aggregatedAcrossReceipts,false);
 const stable=propose(input([b],[first.id]));
 assert.equal(stable.suppressedPriorIdeas,1);
 assert.equal(stable.status,'NO_NEW_ACTIONABLE_IDEAS');
 assert.deepEqual(stable.ideas,[]);
});
test('equally rated evidence uses stable ID ordering without adding counts across receipts',()=>{
 const a=row(20,'jarvis','WRONG_AVAILABILITY',2,6);
 const b=row(21,'jarvis','WRONG_AVAILABILITY',2,6);
 const x=propose(input([b,a])).ideas[0];
 assert.equal(x.evidence.id,id(20));assert.equal(x.evidence.sampleCount,6);
 assert.equal(x.evidence.affectedCount,2);
});
test('rejects incompatible scopes, raw content, unverifiable shapes and impossible counts',()=>{
 const expected=[
  [input([row(1,'source','UNKNOWN_AFTER_INTERRUPT')]),'EVIDENCE_OUTCOME_UNSUPPORTED'],
  [input([{...row(1,'source','SOURCE_UNREACHABLE'),family:'other'}]),'EVIDENCE_OUTCOME_UNSUPPORTED'],
  [input([{...row(1,'source','SOURCE_UNREACHABLE'),rawText:'no raw documents'}]),'EVIDENCE_ROW_INVALID'],
  [input([{...row(1,'source','SOURCE_UNREACHABLE'),evidenceId:'unreviewed-note'}]),'EVIDENCE_ID_INVALID'],
  [input([row(1,'source','SOURCE_UNREACHABLE',3,2)]),'EVIDENCE_COUNTS_INVALID'],
  [input([row(1,'source','SOURCE_UNREACHABLE',0)]),'EVIDENCE_COUNTS_INVALID'],
  [input([row(1,'source','SOURCE_UNREACHABLE',1,1,'EXPECTED_BEHAVIOR')]),'EVIDENCE_COUNTS_INVALID'],
  [input([row(1,'source','VERIFIED',0)]),'EVIDENCE_ASSESSMENT_INVALID'],
  [input([row(1,'source','SOURCE_UNREACHABLE',1,10001)]),'EVIDENCE_COUNTS_INVALID'],
 ];
 for(const [payload,code] of expected)assert.throws(()=>propose(payload),{code});
});
test('bounds and rejects duplicate evidence/prior IDs, no mutation of caller snapshot',()=>{
 const a=row(1,'source','SOURCE_UNREACHABLE');
 assert.throws(()=>propose(input([a,{...a,family:family.jarvis,outcome:'WRONG_AVAILABILITY'}])),{code:'EVIDENCE_ID_INVALID'});
 assert.throws(()=>propose(input([],['x'])),{code:'PRIOR_ID_INVALID'});
 assert.throws(()=>propose(input([],[id(1),id(1)])),{code:'PRIOR_ID_INVALID'});
 assert.throws(()=>propose(input([],Array.from({length:129},(_,i)=>id(i)))),{code:'PRIOR_ID_LIMIT'});
 assert.throws(()=>propose(input(Array.from({length:33},(_,i)=>row(i,'source','SOURCE_UNREACHABLE')))),{code:'REVIEWED_EVIDENCE_SNAPSHOT_REQUIRED'});
 const payload=Object.freeze(input(Object.freeze([Object.freeze(a)]),Object.freeze([])));
 const before=JSON.stringify(payload);
 propose(payload);assert.equal(JSON.stringify(payload),before);
});

test('confirmed positive campaign coverage exhaustion proposes one new test, not a failure or rollout',()=>{
 const fresh=row(31,'campaign','VERIFIED_COMPLETE_NO_FRESH_CASE',1,1,'CONFIRMED_OPPORTUNITY');
 const result=propose(input([fresh]));
 assert.equal(result.status,'IDEAS_PENDING_REVIEW');
 assert.equal(result.ideas.length,1);
 const [idea]=result.ideas;
 assert.equal(idea.evidence.assessment,'CONFIRMED_OPPORTUNITY');
 assert.equal(idea.evidence.id,id(31));
 assert.equal(idea.topic,'add-one-reviewed-unseen-benign-case');
 assert.equal(idea.leastNextAcceptanceTest.id,'one-independent-unseen-case-and-restart');
 assert.equal(result.actionsExecuted,0);
 assert.equal(propose(input([fresh],[idea.id])).status,'NO_NEW_ACTIONABLE_IDEAS');
 assert.throws(()=>propose(input([{...fresh,assessment:'CONFIRMED_GAP'}])),{code:'EVIDENCE_ASSESSMENT_INVALID'});
 assert.throws(()=>propose(input([{...fresh,sampleCount:2}])),{code:'CAMPAIGN_AGGREGATE_UNSUPPORTED'});
 const withGap=propose(input([fresh,row(22,'source','SOURCE_SCOPE_MISMATCH')]));
 assert.equal(withGap.ideas[0].evidence.assessment,'CONFIRMED_GAP');
});
