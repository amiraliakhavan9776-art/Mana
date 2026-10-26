'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {createClaimTools}=require('../src/financial/claim-tools.cjs'),{createMissionRuntime}=require('../src/native/mission-runtime.cjs');
const example=fs.readFileSync(path.join(__dirname,'../examples/claim.mixed.example.json'));
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-claims-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.chmodSync(dir,0o700);
 const sourceFile=path.join(dir,'claim.json');fs.writeFileSync(sourceFile,example,{mode:0o600});const expectedSourceSha256=digest(example),scope={organizationId:'local',projectId:'sample'},factory={sourceFile,outputDirectory:dir,expectedSourceSha256,scope},tools=createClaimTools(factory),project={id:'sample',orgId:'local'},principal={id:'u',orgId:'local',role:'analyst',projectIds:['sample'],capabilityIds:[...tools.map(t=>t.id),...['create','run','read','reconcile'].map(x=>'native.mission.'+x)]};
 const config={file:path.join(dir,'state.enc'),key:Buffer.alloc(32,13),tools,authorize:()=>true},args={principal,project,objective:'Produce verified draft claim',goals:['claim-report'],evidence:[{id:'e',orgId:'local',projectId:'sample',key:'claim-source',value:true,source:expectedSourceSha256,verification:'verified'}],inputs:Object.fromEntries(tools.map(t=>[t.id,{}])),requestKey:'claim-1'};
 return {dir,factory,tools,project,principal,config,args};
}
test('a changed shared arithmetic dependency fences an existing mission before any claim tool executes',async t=>{
 const s=setup(t),copy=path.join(s.dir,'copied-source');
 for(const relative of ['financial/claim-tools.cjs','financial/claims.cjs','financial/exact-decimal.cjs','exact-json.cjs','approval-store.cjs','encrypted-state.cjs']){const target=path.join(copy,relative);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.copyFileSync(path.join(__dirname,'../src',relative),target);}
 const factory=require(path.join(copy,'financial/claim-tools.cjs')).createClaimTools,config={...s.config,tools:factory(s.factory)},runtime=createMissionRuntime(config),mission=runtime.create(s.args).mission;
 fs.appendFileSync(path.join(copy,'financial/exact-decimal.cjs'),'\n// Independent arithmetic revision\n');const restarted=createMissionRuntime({...config,tools:factory(s.factory)}),result=await restarted.runNext({principal:s.principal,project:s.project,missionId:mission.id});
 assert.equal(result.status,'needs_replan');assert.ok(result.tasks.every(t=>t.attempts.length===0));
});
test('same durable runtime executes pinned claim inspection, exact calculation and verified file report across restart',async t=>{
 const s=setup(t);let runtime=createMissionRuntime(s.config);const mission=runtime.create(s.args).mission,context={principal:s.principal,project:s.project,missionId:mission.id};
 await runtime.runNext(context);runtime=createMissionRuntime({...s.config,tools:createClaimTools(s.factory)});await runtime.runNext(context);const done=await runtime.runNext(context);
 assert.equal(done.status,'completed');assert.equal(done.tasks.length,3);const receipt=done.tasks[2].result,bytes=fs.readFileSync(path.join(s.dir,receipt.name)),report=JSON.parse(bytes);
 assert.equal(report.schema,'MANA_CLAIM_DRAFT_REPORT_V1');assert.equal(report.calculation.totals.gross,'9500.00');assert.equal(report.calculation.totals.net,'9925.30');assert.equal(report.calculation.totals.balance,'9425.30');assert.equal(report.calculation.lines.length,5);assert.equal(report.sourceSha256,s.factory.expectedSourceSha256);assert.equal(digest(bytes),receipt.sha256);
 assert.equal((await runtime.runNext(context)).version,done.version);assert.equal(runtime.create(s.args).mission.id,mission.id);
 const modified={...done.tasks[1].result,calculation:{...done.tasks[1].result.calculation,totals:{net:'0'}}};assert.equal(s.tools[1].verify({scope:s.factory.scope,result:modified}),false);
 fs.appendFileSync(path.join(s.dir,receipt.name),'tamper');assert.equal(s.tools[2].verify({scope:s.factory.scope,result:receipt}),false);
});
test('foreign project, forged client scope, source changes, duplicate JSON keys and symlinks cannot produce a report',t=>{
 const s=setup(t),runtime=createMissionRuntime(s.config),project={id:'foreign',orgId:'local'},principal={...s.principal,projectIds:['foreign']};
 assert.throws(()=>runtime.create({...s.args,project,principal,evidence:s.args.evidence.map(e=>({...e,projectId:'foreign'}))}),/Invalid tool input/);
 assert.equal(s.tools[0].validate({scope:s.factory.scope},{scope:s.factory.scope}),false);
 fs.unlinkSync(s.factory.sourceFile);assert.throws(()=>s.tools[0].run({scope:{organizationId:'foreign',projectId:'foreign'}}),/scope denied/);
 fs.writeFileSync(s.factory.sourceFile,'{}');assert.throws(()=>s.tools[0].run({scope:s.factory.scope}),/changed/);
 const duplicate=example.toString().replace('"schemaVersion": 1','"schemaVersion": 1, "schemaVersion": 1');fs.writeFileSync(s.factory.sourceFile,duplicate);assert.throws(()=>createClaimTools({...s.factory,expectedSourceSha256:digest(duplicate)}),/Duplicate JSON/);
 const link=path.join(s.dir,'link.json');fs.symlinkSync(s.factory.sourceFile,link);assert.throws(()=>createClaimTools({...s.factory,sourceFile:link,expectedSourceSha256:digest(duplicate)}));
});
test('local operator CLI writes a real draft report and a second process reuses the same completed mission',t=>{
 const s=setup(t),workspace=path.join(s.dir,'cli'),command=path.resolve(__dirname,'../mission-claim-run.cjs'),args=[command,s.factory.sourceFile,workspace,'local','sample'];
 const first=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000});assert.equal(first.status,0,first.stderr);const a=JSON.parse(first.stdout);assert.equal(a.status,'completed');assert.ok(fs.existsSync(a.report));
 const second=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000});assert.equal(second.status,0,second.stderr);const b=JSON.parse(second.stdout);assert.equal(b.missionId,a.missionId);assert.equal(b.report,a.report);assert.equal(b.receipt.sha256,a.receipt.sha256);
 const wrong=spawnSync(process.execPath,[command,s.factory.sourceFile,path.join(s.dir,'other'),'local','foreign'],{encoding:'utf8',timeout:10000});assert.equal(wrong.status,1);assert.equal(wrong.stdout,'');assert.ok(!wrong.stderr.includes('synthetic:contract'));
});
