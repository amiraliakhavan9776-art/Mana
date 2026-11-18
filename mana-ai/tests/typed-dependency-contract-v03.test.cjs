'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createMissionRuntime}=require('../src/native/mission-runtime.cjs');
const project={id:'p',orgId:'org'},principal={id:'u',orgId:'org',role:'analyst',projectIds:['p'],capabilityIds:['read','report',...['create','read','run','control','reconcile'].map(x=>'native.mission.'+x)]};
function setup(t,override={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-mission-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let calls=0;
 const tools=[{id:'read',title:'read',requires:['source'],produces:['checked'],workUnits:1,risk:'read',version:'v1',validateDependencies:()=>true,retrySafe:true,validate:x=>typeof x.text==='string',run:async({input})=>{calls++;return {text:input.text}},verify:({result})=>typeof result.text==='string',...override},{id:'report',title:'report',requires:['checked'],produces:['ready'],workUnits:1,risk:'draft',version:'v1',validateDependencies:()=>true,validate:x=>x.format==='markdown',run:async({dependencies})=>({report:dependencies[0].result.text.toUpperCase()}),verify:({result})=>typeof result.report==='string'}];
 const config={file:path.join(dir,'state'),key:Buffer.alloc(32,3),tools,authorize:()=>true,timeoutMs:500};const runtime=createMissionRuntime(config);
 const args={principal,project,objective:'Produce report',goals:['ready'],evidence:[{id:'e',orgId:'org',projectId:'p',key:'source',value:true,source:'fixture',verification:'verified'}],inputs:{read:{text:'verified source'},report:{format:'markdown'}},requestKey:'req'};
 const mission=runtime.create(args).mission;return {runtime,config,args,mission,ctx:{principal,project,missionId:mission.id},calls:()=>calls};}



test('malformed upstream output is blocked by outputContract', async t => {
  let downstreamCalls = 0;

  const s = setup(t, {
    outputContract: {
      type:'object',
      required:['text'],
      properties:{text:{type:'string'}}
    },
    run: async () => ({text:12345}),
    verify: () => true
  });

  const report = s.config.tools.find(x => x.id === 'report');
  const original = report.run;
  report.run = async (...args) => {
    downstreamCalls++;
    return original(...args);
  };

  const runtime = createMissionRuntime(s.config);
  const mission = runtime.create({
    ...s.args,
    requestKey:'typed-invalid-v03'
  }).mission;

  const ctx = {...s.ctx, missionId:mission.id};

  await runtime.runNext(ctx);
  const second = await runtime.runNext(ctx);

  assert.equal(downstreamCalls, 0);
  assert.notEqual(second.status, 'completed');
});

test('valid upstream output remains executable', async t => {
  let downstreamCalls = 0;

  const s = setup(t, {
    outputContract: {
      type:'object',
      required:['text'],
      properties:{text:{type:'string'}}
    },
    run: async () => ({text:'verified source'}),
    verify: () => true
  });

  const report = s.config.tools.find(x => x.id === 'report');
  const original = report.run;
  report.run = async (...args) => {
    downstreamCalls++;
    return original(...args);
  };

  const runtime = createMissionRuntime(s.config);
  const mission = runtime.create({
    ...s.args,
    requestKey:'typed-valid-v03'
  }).mission;

  const ctx = {...s.ctx, missionId:mission.id};

  await runtime.runNext(ctx);
  const second = await runtime.runNext(ctx);

  assert.equal(downstreamCalls, 1);
  assert.equal(second.status, 'completed');
});
