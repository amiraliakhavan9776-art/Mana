'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createNativeCore}=require('../src/native/core.cjs');
const project={id:'p',orgId:'org'},principal={id:'u',orgId:'org',role:'analyst',projectIds:['p'],capabilityIds:['inspect','draft','fast','release']};
const capabilities=[
 {id:'inspect',title:'بررسی شواهد',requires:['source'],produces:['checked'],workUnits:2,risk:'read'},
 {id:'draft',title:'تدوین پیش‌نویس',requires:['checked'],produces:['ready'],workUnits:3,risk:'draft'},
 {id:'fast',title:'مسیر پرهزینه',requires:['source'],produces:['ready'],workUnits:9,risk:'draft'},
 {id:'release',title:'انتشار حساس',requires:['ready'],produces:['released'],workUnits:1,risk:'regulated'}
];
const evidence=(id,key,value,extra={})=>({id,orgId:'org',projectId:'p',key,value,source:'synthetic-fixture',verification:'verified',...extra});
const base={principal,project,objective:'تدوین گزارش',goals:['ready'],evidence:[evidence('e1','source',true)]};
test('native planner finds the least-work dependency chain without any model/provider or execution',()=>{
 const core=createNativeCore({capabilities});
 const plan=core.plan(base);
 assert.equal(plan.status,'PLAN_PROPOSED');assert.deepEqual(plan.steps.map(s=>s.capabilityId),['inspect','draft']);
 assert.equal(plan.totalWorkUnits,5);assert.equal(plan.actionsExecuted,0);assert.equal(plan.requiresHumanReview,true);
 assert.deepEqual(plan.wbs.map(t=>({id:t.id,dependsOn:t.dependsOn})),[{id:'task-1',dependsOn:[]},{id:'task-2',dependsOn:['task-1']}]);
 assert.equal(Object.isFrozen(plan.steps[0]),true);
 assert.deepEqual(core.plan(base),plan);
});
test('risk gates are catalog-owned and unknown model fields cannot enable an action',()=>{
 const core=createNativeCore({capabilities}),plan=core.plan({...base,goals:['released']});
 const last=plan.steps.at(-1);assert.equal(last.requiresApproval,true);assert.equal(last.requiresProfessionalSignoff,true);
 assert.equal(last.executed,false);assert.equal(plan.actionsExecuted,0);
 assert.throws(()=>core.plan({...base,approved:true}));
 assert.throws(()=>createNativeCore({capabilities:[{...capabilities[0],risk:'safe-bypass'}]}));
});
test('missing evidence, budget and capability grants cannot be bypassed by claimed goals',()=>{
 const core=createNativeCore({capabilities});
 for(const changes of [{evidence:[]},{maxWorkUnits:4},{principal:{...principal,capabilityIds:[]}}])assert.equal(core.plan({...base,...changes}).status,'NO_PLAN_WITHIN_CONSTRAINTS');
 const satisfied=core.plan({...base,goals:['source'],maxWorkUnits:0});assert.equal(satisfied.steps.length,0);
 assert.throws(()=>core.plan({...base,principal:{...principal,projectIds:[]}}),/access denied/);
});
test('conflicting verified evidence blocks planning while unverified and foreign records grant no facts',()=>{
 const core=createNativeCore({capabilities});
 assert.equal(core.plan({...base,evidence:[...base.evidence,evidence('e2','source',false)]}).status,'EVIDENCE_CONFLICT');
 for(const extra of [{verification:'unverified'},{orgId:'other'},{projectId:'other'}])assert.equal(core.plan({...base,evidence:[evidence('e2','source',true,extra)]}).status,'NO_PLAN_WITHIN_CONSTRAINTS');
 const result=core.plan({...base,evidence:[...base.evidence,evidence('secret','source',false,{orgId:'other'})]});
 assert.equal(result.status,'PLAN_PROPOSED');assert.doesNotMatch(JSON.stringify(result),/secret/);
});
test('cyclic unsatisfied capabilities terminate and search caps report uncertainty rather than impossibility',()=>{
 const cycle=[{id:'a',title:'a',requires:['y'],produces:['x'],workUnits:1,risk:'draft'},{id:'b',title:'b',requires:['x'],produces:['y'],workUnits:1,risk:'draft'}];
 assert.equal(createNativeCore({capabilities:cycle}).plan({...base,goals:['x']}).status,'NO_PLAN_WITHIN_CONSTRAINTS');
 assert.equal(createNativeCore({capabilities,maxStates:1}).plan(base).status,'SEARCH_LIMIT_REACHED');
 assert.throws(()=>createNativeCore({capabilities:[capabilities[0],capabilities[0]]}),/Duplicate/);
});
const criteria=[{id:'cost',weight:50,direction:'minimize',min:0,max:100},{id:'quality',weight:50,direction:'maximize',min:0,max:10,requiredMin:5}];
function decision(){
 const alternatives=[{id:'a',label:'ارزان ولی نامعتبر',assessments:[{criterionId:'cost',value:0,evidenceIds:['ac']},{criterionId:'quality',value:2,evidenceIds:['aq']}]},{id:'b',label:'گزینهٔ قابل بررسی',assessments:[{criterionId:'cost',value:40,evidenceIds:['bc']},{criterionId:'quality',value:8,evidenceIds:['bq']}]}];
 return {principal,project,criteria,alternatives,evidence:[evidence('ac','a:cost',0),evidence('aq','a:quality',2),evidence('bc','b:cost',40),evidence('bq','b:quality',8)]};
}
test('criteria council applies evidence-bound weights and hard vetoes before ranking',()=>{
 const result=createNativeCore().evaluate(decision());
 assert.equal(result.status,'DECISION_PROPOSED');assert.equal(result.recommendedId,'b');assert.equal(result.rankings[0].score,0.7);
 assert.equal(result.rankings[1].eligible,false);assert.equal(result.rankings[1].blockers[0].reason,'hard_constraint_veto');
 assert.equal(result.actionsExecuted,0);assert.equal(result.requiresHumanReview,true);
});
test('unrelated source IDs, foreign evidence, numeric conflicts or unsupported scores cannot prove a decision',()=>{
 for(const change of [e=>({...e,orgId:'other'}),e=>({...e,key:'unrelated'}),e=>({...e,verification:'unverified'})]){
  const input=decision();input.evidence=input.evidence.map(change);
  assert.equal(createNativeCore().evaluate(input).status,'NO_ADMISSIBLE_OPTION');
 }
 const input=decision();input.evidence.push(evidence('conflict','b:quality',7));
 assert.equal(createNativeCore().evaluate(input).status,'NO_ADMISSIBLE_OPTION');
 const altered=decision();altered.alternatives[1].assessments[1].value=10;
 assert.equal(createNativeCore().evaluate(altered).status,'NO_ADMISSIBLE_OPTION');
});
test('equal options abstain rather than manufacture a winner; invalid criteria fail closed',()=>{
 const input=decision();input.criteria=[criteria[0]];for(const a of input.alternatives)a.assessments=a.assessments.slice(0,1);
 input.alternatives[1].assessments[0].value=0;input.evidence.find(e=>e.id==='bc').value=0;
 const result=createNativeCore().evaluate(input);assert.equal(result.status,'TIED_REQUIRES_REVIEW');assert.equal(result.recommendedId,null);assert.deepEqual(result.tiedIds,['a','b']);
 assert.throws(()=>createNativeCore().evaluate({...input,criteria:[{...criteria[0],weight:0}]}));
 assert.throws(()=>createNativeCore().evaluate({...input,criteria:[{...criteria[0],min:100}]}));
});

test('100 generated small planning problems agree with an independent exhaustive subset oracle',()=>{
 let seed=20261026;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n};
 for(let trial=0;trial<100;trial++){
  const facts=['f0','f1','f2','f3','f4','f5'],initial=new Set(facts.filter(()=>random(3)===0)),goal=facts[random(facts.length)];
  const caps=Array.from({length:8},(_,i)=>({id:'c'+i,title:'synthetic',requires:[...new Set(Array.from({length:random(3)},()=>facts[random(facts.length)]))],produces:[facts[random(facts.length)]],workUnits:random(10),risk:'draft'}));
  const budget=random(25);
  // Oracle: enumerate all capability subsets, compute dependency closure, then minimize
  // total subset cost. This does not use the planner's priority queue or state search.
  let optimum=Infinity;
  for(let mask=0;mask<256;mask++){
   const selected=caps.filter((_,i)=>mask&(1<<i)),cost=selected.reduce((n,c)=>n+c.workUnits,0);
   if(cost>budget||cost>=optimum)continue;
   const known=new Set(initial);let changed=true;
   while(changed){changed=false;for(const c of selected)if(c.requires.every(f=>known.has(f)))for(const f of c.produces)if(!known.has(f)){known.add(f);changed=true}}
   if(known.has(goal))optimum=cost;
  }
  const plan=createNativeCore({capabilities:caps}).plan({...base,principal:{...principal,capabilityIds:caps.map(c=>c.id)},goals:[goal],evidence:[...initial].map((f,i)=>evidence('e'+i,f,true)),maxWorkUnits:budget});
  if(optimum===Infinity){assert.equal(plan.status,'NO_PLAN_WITHIN_CONSTRAINTS','trial '+trial);continue}
  assert.equal(plan.status,'PLAN_PROPOSED','trial '+trial);assert.equal(plan.totalWorkUnits,optimum,'trial '+trial);
  const known=new Set(initial);for(const s of plan.steps){assert.ok(s.requires.every(f=>known.has(f)));for(const f of s.simulatedEffects)known.add(f)}
  assert.ok(known.has(goal));assert.equal(plan.actionsExecuted,0);
 }
});
test('runnable native demo remains independent of network inference',()=>{
 const {demo}=require('../native-core-demo.cjs'),original=global.fetch;
 try{
  global.fetch=()=>{throw Error('Network must not be called')};
  const result=demo();
  assert.equal(result.planning.totalWorkUnits,5);assert.equal(result.planning.wbs.length,2);
  assert.equal(result.decision.recommendedId,'b');assert.equal(result.inferenceRequired,false);
 }finally{global.fetch=original}
});
