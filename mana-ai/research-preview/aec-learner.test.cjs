'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{test}=require('node:test'),{spawnSync}=require('node:child_process');
const {learnAec,readAecLearning}=require('./aec-learner.cjs');
const {twiceArea}=require('./aec-learner-oracle.cjs');
const evidenceSha256='e'.repeat(64);
const independentFitInputs=[[1,1,3],[5,7,13],[9,7,13],[5,12,13],[5,7,19],[1,11,2],[239,1,3],[8,17,2],[7,51,301],[991,227,9],[10000,3,75],[71,989,43],[66,66,101],[997,701,3]];
const fit=(examples=independentFitInputs.map(x=>[x,Number(twiceArea(x,-23n))]))=>({
 schema:'MANA_INTEGER_EXAMPLES_V1',id:'trapezoid-panel-area-twice-mm2',
 fields:['base_a_mm','base_b_mm','height_mm'].map(id=>({id,power:1,max:100000})),
 outputPower:2,examples,
});
const state=t=>{
 const workspace=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mana-aec-learner-test-')));
 t.after(()=>fs.rmSync(workspace,{recursive:true,force:true}));return workspace;
};

test('same bounded worker builds an AST, freezes before scoring sixteen independent BigInt geometry checks, and cold replay is inert',t=>{
 const workspace=state(t),config={workspace,fit:fit(),evidenceSha256};
 assert.throws(()=>readAecLearning(config),/NOT_TERMINAL_NO_RETRY/);assert.deepEqual(fs.readdirSync(workspace),[]);
 const r=learnAec(config);
 assert.equal(r.status,'AWAITING_HUMAN_REVIEW');assert.equal(r.unit,'twice-area-mm2');assert.equal(r.areaDenominator,2);
 assert.deepEqual([r.passed,r.total,r.testsRun],[16,16,16]);
 assert.equal(r.modelCalls,0);assert.equal(r.activationAuthorized,false);assert.equal(r.productionAllowed,false);
 for(const key of ['candidateSha256','freezeSha256','gradeSha256','fitFileSha256'])assert.match(r[key],/^[a-f0-9]{64}$/);
 const entries=()=>fs.readdirSync(workspace).sort().map(name=>[name,fs.readFileSync(path.join(workspace,name),'utf8')]);
 const before=entries();assert.deepEqual(readAecLearning(config),r);assert.deepEqual(learnAec(config),r);assert.deepEqual(entries(),before);
 assert.throws(()=>readAecLearning({...config,evidenceSha256:'c'.repeat(64)}),/CLAIM_BINDING_MISMATCH/);
});

test('worker may read the exact fit but not the independent oracle or arbitrary paths',t=>{
 const workspace=state(t),allowed=path.join(workspace,'training.json');
 fs.writeFileSync(allowed,JSON.stringify(fit()));
 const check=spawnSync(process.execPath,['--permission','--allow-fs-read='+allowed,'-e',
  'const fs=require("node:fs"),a=require("node:assert/strict");a.ok(fs.readFileSync(process.argv[1]).length);a.throws(()=>fs.readFileSync(process.argv[2]),{code:"ERR_ACCESS_DENIED"});a.throws(()=>fs.writeFileSync(process.argv[1],"invalid"),{code:"ERR_ACCESS_DENIED"});',
  allowed,require.resolve('./aec-learner-oracle.cjs')],{env:{},timeout:3000,encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
});

test('malformed fields and conflicting labels reject before a durable claim',t=>{
 const workspace=state(t),pack=fit();
 pack.examples[1]=[pack.examples[0][0],999];
 assert.throws(()=>learnAec({workspace,fit:pack,evidenceSha256}),/CONFLICTING_FIT_ROW/);
 assert.throws(()=>learnAec({workspace,fit:{...fit(),outputPower:3},evidenceSha256}),/FIT_POLICY_MISMATCH/);
 const zero=fit();zero.examples[0]=[[0,1,3],3];
 assert.throws(()=>learnAec({workspace,fit:zero,evidenceSha256}),/INVALID_OR_CONFLICTING_FIT_ROW/);
 assert.deepEqual(fs.readdirSync(workspace),[]);
});

test('ambiguous synthesis cannot claim independent grading or promotion',t=>{
 const workspace=state(t);
 const training=Array.from({length:10},(_,i)=>{const n=100+i*9,h=31+i*7;return [[n,n,h],n*h];});
 const config={workspace,fit:fit(training),evidenceSha256};
 const r=learnAec(config);
 assert.equal(r.status,'SYNTHESIS_AMBIGUOUS');assert.equal(r.testsRun,0);assert.equal(r.candidateSha256,null);assert.equal(r.activationAuthorized,false);
 assert.deepEqual(readAecLearning(config),r);
});

test('interrupted and changed durable evidence never relaunch the learner',t=>{
 const workspace=state(t),config={workspace,fit:fit(),evidenceSha256};
 const fitPath=path.join(workspace,'fit-only.json');
 fs.writeFileSync(fitPath,'interrupted placeholder',{mode:0o600});
 assert.throws(()=>learnAec(config),{code:'EEXIST'});
 fs.unlinkSync(fitPath);
 assert.throws(()=>learnAec(config),/ALREADY_CLAIMED_NO_RETRY/);
 assert.throws(()=>readAecLearning(config),/NOT_TERMINAL_NO_RETRY/);
 assert.deepEqual(fs.readdirSync(workspace),['claim.json']);
 const second=state(t),updated={...config,workspace:second};
 learnAec(updated);
 const f=path.join(second,'frozen.json'),body=JSON.parse(fs.readFileSync(f));
 body.evidenceSha256='d'.repeat(64);
 fs.writeFileSync(f,JSON.stringify(body)+'\n');
 assert.throws(()=>readAecLearning(updated),/FREEZE_BINDING_MISMATCH/);
 assert.throws(()=>learnAec(updated),/FREEZE_BINDING_MISMATCH/);
});

test('reference covers odd area exactly and is translation-offset and base-swap invariant',()=>{
 assert.equal(twiceArea([8,17,1]),25n);
 assert.equal(twiceArea([100000,100000,100000]),20000000000n);
 assert.equal(twiceArea([13,7,15],-91n),twiceArea([7,13,15],423n));
});
