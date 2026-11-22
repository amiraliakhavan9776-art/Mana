'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {test} = require('node:test');
const {createNightly} = require('../run-rd-nightly-tick.cjs');
const IDS = ['net-finish-length-mm', 'uniform-layer-volume-mm3'];
const READY_REVIEW = 'AWAITING_HUMAN_REVIEW';
const safe = {modelCalls:0, activationAuthorized:false, productionAllowed:false, modelTrainingPerformed:false};
const H = 3600000;

const RESERVATION = 'mana-nightly-owner.json';
function setup(t){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'native-nightly-test-')));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const state=path.join(root,'state');
  const campaign=path.join(state,'campaign'),workspace=path.join(state,'native'),masterPath=path.join(root,'master.txt');
  for(const d of [state,campaign,workspace]) fs.mkdirSync(d,{mode:0o700});
  return {campaign,workspace,masterPath};
}
function lab(t,{fail,intercept,skipReadback,badScore}={}){
  const config=setup(t),calls=[],outcomes=[];
  let now=1000;
  const nativeFactory=()=>({
    inspect(){return {...safe,status:outcomes.length===2?'COMPLETE':'READY',mission:IDS[outcomes.length],outcomes:[...outcomes]};},
    run(){
      const i=outcomes.length,mission=IDS[i],digest=String(i+1).repeat(64);
      assert.ok(fs.existsSync(path.join(config.campaign,'attempt-'+(i+1)+'.claim.json')));
      calls.push(mission);
      intercept?.();
      if(fail==='throw') throw Error('deliberate interruption');
      const status=fail||READY_REVIEW;
      if(!skipReadback) outcomes.push({mission,digest,status,score:{testsRun:24,insensitive:[],unit:i?'mm3':'mm',
        regression:{passed:badScore?7:8,total:8},fresh:{passed:16,total:16},regressionSha256:'a'.repeat(64)}});
      return {...safe,status,digest,workerRunsThisInvocation:1,evidence:{binding:{mission}}};
    }
  });
  const open=()=>createNightly({...config,nativeFactory,now:()=>now});
  return {open,calls,outcomes,config,clock:t=>{now=t;}};
}

test('two explicitly triggered ticks, independent review, bounded completion and immutable restart', t=>{
  const q=lab(t);
  assert.throws(()=>q.open().tick(),/CAMPAIGN_NOT_INITIALIZED/);
  assert.equal(q.open().init().status,'INITIALIZED');
  assert.throws(()=>q.open().init(),/EMPTY_WORKSPACES/);
  assert.equal(q.open().inspect().mission,IDS[0]);
  assert.deepEqual(q.calls,[]);
  const a=q.open().tick();
  assert.equal(a.status,'CASE_VERIFIED');
  assert.equal(a.regressionPassed+a.freshPassed,24);
  assert.equal(a.activationAuthorized,false);
  assert.deepEqual(q.calls,[IDS[0]]);
  assert.equal(q.open().inspect().mission,IDS[1]);
  assert.equal(q.open().tick().status,'CASE_VERIFIED');
  const receipts=()=>Object.fromEntries(fs.readdirSync(q.config.campaign).map(x=>[x,fs.readFileSync(path.join(q.config.campaign,x),'hex')]));
  const frozen=receipts();
  assert.equal(q.open().tick().status,'COMPLETE_REVIEW_ONLY');
  assert.equal(q.open().inspect().verifiedCases,2);
  assert.deepEqual(q.calls,IDS);
  assert.deepEqual(receipts(),frozen);
});

test('verified failed independent benchmark stops; exception, false pass, or wrong scores halt as unknown', t=>{
  for(const [opts,expect] of [[{fail:'BENCHMARK_FAILED'},'HALTED_FAILURE_NO_RETRY'],
      [{fail:'throw'},'HALTED_UNKNOWN_NO_RETRY'],[{skipReadback:true},'HALTED_UNKNOWN_NO_RETRY'],
      [{badScore:true},'HALTED_UNKNOWN_NO_RETRY']]){
    const q=lab(t,opts);
    q.open().init();
    assert.equal(q.open().tick().status,expect);
    assert.equal(q.open().inspect().status,expect);
    assert.equal(q.open().tick().status,expect);
    assert.deepEqual(q.calls,[IDS[0]]);
  }
});

test('the durable claim blocks overlap and a missing terminal after interruption never replays', t=>{
  let q;
  q=lab(t,{intercept(){assert.equal(q.open().tick().status,'HALTED_UNKNOWN_NO_RETRY');}});
  q.open().init();
  assert.equal(q.open().tick().status,'CASE_VERIFIED');
  fs.unlinkSync(path.join(q.config.campaign,'attempt-1.result.json'));
  assert.equal(q.open().tick().status,'HALTED_UNKNOWN_NO_RETRY');
  assert.deepEqual(q.calls,[IDS[0]]);
});

test('time rollback and expiry block dispatch; existing workspace and copied campaign rejected', t=>{
  const q=lab(t);
  const sentinel=path.join(q.config.workspace,'old');
  fs.writeFileSync(sentinel,'untouched');
  assert.throws(()=>q.open().init(),/EMPTY_WORKSPACES/);
  assert.equal(fs.readFileSync(sentinel,'utf8'),'untouched');
  fs.unlinkSync(sentinel);
  q.open().init();
  q.clock(999);
  assert.equal(q.open().tick().status,'HALTED_CLOCK_ROLLBACK');
  q.clock(1000+12*H);
  assert.equal(q.open().tick().status,'EXPIRED');
  const copied=path.join(path.dirname(q.config.campaign),'copy');
  fs.cpSync(q.config.campaign,copied,{recursive:true});
  fs.chmodSync(copied,0o700); // Exercise inode binding independent of cp or CI umask.
  assert.throws(()=>createNightly({...q.config,campaign:copied}).inspect(),/CAMPAIGN_RESERVATION_MISMATCH/);
  assert.deepEqual(q.calls,[]);
});

test('a native workspace cannot be reserved by another campaign, and receipt-less init does not reopen', t=>{
  const q=lab(t);
  q.open().init();
  const parent=path.dirname(q.config.campaign);
  const other=path.join(parent,'other');
  fs.mkdirSync(other,{mode:0o700});
  const competing=createNightly({...q.config,campaign:other});
  assert.throws(()=>competing.init(),/PARENT_ALREADY_RESERVED/);
  assert.deepEqual(fs.readdirSync(other),[]);
  assert.equal(q.open().tick().status,'CASE_VERIFIED');
  assert.deepEqual(q.calls,[IDS[0]]);

  const j=lab(t);
  j.open().init();
  const reservation=path.join(path.dirname(j.config.campaign),RESERVATION);
  assert.equal(fs.statSync(reservation).mode&0o777,0o600);
  fs.unlinkSync(path.join(j.config.campaign,'campaign.json'));
  assert.throws(()=>j.open().init(),/PARENT_ALREADY_RESERVED/);
  assert.throws(()=>j.open().tick(),/CAMPAIGN_NOT_INITIALIZED/);
  assert.deepEqual(j.calls,[]);
});

test('two init calls with the same preflight winner cannot both reserve the parent', t=>{
  const q=lab(t);
  const nativeFactory=()=>({
    inspect:()=>({...safe,status:'READY',mission:IDS[0],outcomes:[]}),
    run:()=>assert.fail('init must not dispatch')
  });
  let second;
  const first=createNightly({...q.config,nativeFactory,now:()=>{
    second=createNightly({...q.config,nativeFactory,now:()=>1000}).init();
    return 1000;
  }});
  assert.throws(()=>first.init(),/PARENT_ALREADY_RESERVED/);
  assert.equal(second.status,'INITIALIZED');
  assert.equal(q.open().inspect().status,'READY');
  assert.deepEqual(q.calls,[]);
});

test('tampered ledger or replaced prior native review cannot release another case', t=>{
  const q=lab(t);
  q.open().init();
  assert.equal(q.open().tick().status,'CASE_VERIFIED');
  q.outcomes[0].digest='f'.repeat(64);
  assert.equal(q.open().tick().status,'HALTED_UNEXPECTED_NATIVE_STATE');
  fs.writeFileSync(path.join(q.config.campaign,'attempt-2.result.json'),'{}',{mode:0o600});
  assert.throws(()=>q.open().inspect(),/ORPHAN_CAMPAIGN_RECORD/);
  assert.deepEqual(q.calls,[IDS[0]]);
});

const real=process.env.MANA_TEST_MASTER;
test('actual pinned master and both native CPU cases from fresh private state', {skip:!real||Number(process.versions.node.split('.')[0])<24}, t=>{
  const q=setup(t);
  const open=()=>createNightly({...q,masterPath:real});
  assert.equal(open().init().status,'INITIALIZED');
  for(const mission of IDS) {
    const r=open().tick();
    assert.equal(r.status,'CASE_VERIFIED');
    assert.equal(r.mission,mission);
    assert.equal(r.regressionPassed,8);
    assert.equal(r.freshPassed,16);
  }
  assert.equal(open().tick().status,'COMPLETE_REVIEW_ONLY');
});
