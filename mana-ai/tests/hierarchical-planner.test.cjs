'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHierarchicalPlanner}=require('../src/native/hierarchical-planner.cjs');
const {createMissionRuntime}=require('../src/native/mission-runtime.cjs');
const project={id:'p',orgId:'org'},principal={id:'operator',orgId:'org',role:'analyst',projectIds:['p'],capabilityIds:['inspect','review','draft',...['create','read','run','replan'].map(x=>'native.mission.'+x)]};
const capabilities=[{id:'inspect',title:'inspect',requires:['source'],produces:['checked'],workUnits:1,risk:'read'},{id:'review',title:'review',requires:['checked'],produces:['reviewed'],workUnits:2,risk:'draft'},{id:'draft',title:'draft',requires:['checked'],produces:['done'],workUnits:1,risk:'draft'}];
const methods=[{id:'method.project',task:'project.report',requires:['source'],subtasks:['project.check','draft']},{id:'method.check',task:'project.check',requires:[],subtasks:['inspect','review']}];
const evidence=[{id:'source',orgId:'org',projectId:'p',key:'source',value:true,source:'test-fixture',verification:'verified'}];
const input={principal,project,objective:'Reviewed report',tasks:['project.report'],goals:['done'],evidence,maxWorkUnits:4};
test('nested methods preserve obligatory review and ordered dependency even when goal-only plan could skip it',()=>{
 const h=createHierarchicalPlanner({capabilities,methods}),plan=h.plan(input);assert.equal(plan.status,'PLAN_PROPOSED');assert.deepEqual(plan.steps.map(s=>s.capabilityId),['inspect','review','draft']);assert.equal(plan.totalWorkUnits,4);assert.deepEqual(plan.steps[2].dependsOn,['task-2','task-1']);assert.equal(plan.actionsExecuted,0);assert.equal(plan.methodTrace.length,2);
 assert.equal(h.plan({...input,maxWorkUnits:3}).status,'NO_PLAN_WITHIN_CONSTRAINTS');
});
test('alternative method selects bounded lowest work and never bypasses grants or risky-step gates',()=>{
 const alternate=[...methods,{id:'method.direct',task:'project.report',requires:[],subtasks:['inspect','draft']}];
 const h=createHierarchicalPlanner({capabilities,methods:alternate});assert.equal(h.plan(input).totalWorkUnits,2);
 assert.equal(h.plan({...input,principal:{...principal,capabilityIds:['inspect']}}).status,'NO_PLAN_WITHIN_CONSTRAINTS');
 const risky=createHierarchicalPlanner({capabilities:capabilities.map(c=>c.id==='draft'?{...c,risk:'regulated'}:c),methods}).plan(input);assert.equal(risky.steps.at(-1).requiresApproval,true);assert.equal(risky.steps.at(-1).requiresProfessionalSignoff,true);
});
test('foreign/unverified/conflicting evidence, hierarchy cycles, unknown tasks and search exhaustion stop',()=>{
 const h=createHierarchicalPlanner({capabilities,methods});assert.throws(()=>h.plan({...input,project:{id:'foreign',orgId:'org'}}),/denied/);
 assert.equal(h.plan({...input,evidence:[{...evidence[0],verification:'unverified'}]}).status,'NO_PLAN_WITHIN_CONSTRAINTS');
 assert.equal(h.plan({...input,evidence:[evidence[0],{...evidence[0],id:'contradiction',value:false}]}).status,'EVIDENCE_CONFLICT');
 assert.throws(()=>createHierarchicalPlanner({capabilities,methods:[{id:'cycle',task:'loop',requires:[],subtasks:['loop']}]}),/Cyclic/);
 assert.throws(()=>createHierarchicalPlanner({capabilities,methods:[{id:'unknown',task:'loop',requires:[],subtasks:['missing']}]}),/Unknown/);
 assert.equal(createHierarchicalPlanner({capabilities,methods,maxStates:1}).plan(input).status,'SEARCH_LIMIT_REACHED');
});
test('actual shared runtime executes ordered hierarchy, survives restart and binds method configuration',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-htn-runtime-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const calls=[];
 const tools=capabilities.map(c=>({...c,version:'v1',validate:()=>true,validateDependencies:()=>true,run:async()=>{calls.push(c.id);return {ok:true}},verify:({result})=>result.ok===true}));
 const config={file:path.join(dir,'state'),key:Buffer.alloc(32,9),tools,authorize:()=>true,hierarchicalMethods:methods};
 const request={...input,inputs:{inspect:{},review:{},draft:{}},requestKey:'hierarchy'};const runtime=createMissionRuntime(config),mission=runtime.create(request).mission,context={principal,project,missionId:mission.id};
 await runtime.runNext(context);await createMissionRuntime(config).runNext(context);const done=await runtime.runNext(context);assert.equal(done.status,'completed');assert.deepEqual(calls,['inspect','review','draft']);assert.equal(runtime.create(request).mission.id,mission.id);
 assert.throws(()=>createMissionRuntime({...config,hierarchicalMethods:methods.map(m=>({...m,id:m.id+'.revised'}))}).create(request),/different content/);
 assert.throws(()=>runtime.replan({...context,expectedVersion:done.version,evidence,inputs:{}}),/Hierarchical replan denied/);
});
test('actual hierarchical document CLI creates a checked report and reuses completed encrypted mission',t=>{
 const {spawnSync}=require('node:child_process'),root=fs.mkdtempSync(path.join(os.tmpdir(),'mana-htn-cli-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'inventory.json'),workspace=path.join(root,'workspace');fs.copyFileSync(path.join(__dirname,'../examples/inventory.json'),source);
 const run=()=>{const result=spawnSync(process.execPath,[path.join(__dirname,'../mission-document-run.cjs'),source,workspace,'--hierarchical'],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);};
 const first=run(),second=run();assert.equal(first.status,'completed');assert.equal(first.planningMode,'hierarchical');assert.equal(second.missionId,first.missionId);assert.match(fs.readFileSync(first.artifact,'utf8'),/Inventory replenishment/);
});
