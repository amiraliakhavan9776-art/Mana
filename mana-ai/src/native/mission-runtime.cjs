'use strict';
// Durable single-host mission execution. Only read/draft adapters may run here.
const {randomUUID,createHash}=require('node:crypto');
const {createNativeCore}=require('./core.cjs');
const {createEncryptedState}=require('../encrypted-state.cjs');
const {payloadDigest}=require('../approval-store.cjs');
const {canAccessProject}=require('../security.cjs');
const ID=/^[A-Za-z0-9_-]{1,100}$/;
function clone(value){payloadDigest(value);return JSON.parse(JSON.stringify(value))}
function createMissionRuntime({file,key,tools,authorize,now=Date.now,timeoutMs=2000,missionTtlMs=3600000,maxMissions=100}={}){
 if(!Array.isArray(tools)||tools.length>32||typeof authorize!=='function'||typeof now!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<10||timeoutMs>30000||!Number.isInteger(missionTtlMs)||missionTtlMs<timeoutMs||missionTtlMs>86400000||!Number.isInteger(maxMissions)||maxMissions<1||maxMissions>1000)throw Error('Invalid mission runtime configuration');
 const registry=new Map(),capabilities=[];
 for(const t of tools){
  if(!t||typeof t.version!=='string'||!ID.test(t.version)||!['validate','validateDependencies','run','verify'].every(k=>typeof t[k]==='function')||registry.has(t.id))throw Error('Invalid tool adapter');
  const descriptor=clone({id:t.id,title:t.title,requires:t.requires,produces:t.produces,workUnits:t.workUnits,risk:t.risk});
  if(t.configurationDigest!==undefined&&!/^[a-f0-9]{64}$/.test(t.configurationDigest))throw Error('Invalid configuration digest');
  const fingerprint=payloadDigest({configurationDigest:t.configurationDigest??null,descriptor,version:t.version,retrySafe:t.retrySafe===true,code:createHash('sha256').update(t.validateDependencies.toString()+t.validate.toString()+t.run.toString()+t.verify.toString()).digest('hex')});
  registry.set(t.id,Object.freeze({...descriptor,version:t.version,retrySafe:t.retrySafe===true,fingerprint,validate:t.validate,validateDependencies:t.validateDependencies,run:t.run,verify:t.verify}));capabilities.push(descriptor);
 }
 const core=createNativeCore({capabilities}),store=createEncryptedState({file,key,kind:'MANA_MISSION_RUNTIME_V1'}),active=new Map();
 function time(){const value=now();if(!Number.isSafeInteger(value)||value<0||value>Number.MAX_SAFE_INTEGER-86400000)throw Error('Invalid mission clock');return value}
 function check(principal,project,operation){
  if(!principal||typeof principal.id!=='string'||!ID.test(principal.id)||!canAccessProject(principal,project)||!Array.isArray(principal.capabilityIds)||!principal.capabilityIds.includes('native.mission.'+operation)||authorize(principal,operation,{orgId:project.orgId,projectId:project.id})!==true)throw Error('Mission access denied');
 }
 function transact(update){return store.transact(raw=>{const state=raw??{version:1,missions:[]};if(state.version!==1||!Array.isArray(state.missions))throw Error('Invalid mission state');return update(state)})}
 function find(state,missionId,project){const m=state.missions.find(m=>m.id===missionId&&m.orgId===project.orgId&&m.projectId===project.id);if(!m)throw Error('Mission not found');return m}
 function event(m,principal,kind,taskId){
  if(m.events.length>=2000)throw Error('Mission audit capacity reached');
  m.events.push({eventId:randomUUID(),missionId:m.id,orgId:m.orgId,projectId:m.projectId,actorId:principal.id,kind,taskId:taskId??null,at:time()});m.version++;
 }
 function outcome(m){
  if(m.cancelRequested)return 'cancelled';
  if(m.tasks.every(t=>['succeeded','superseded'].includes(t.status)))return 'completed';
  return m.pauseRequested?'paused':'queued';
 }
 function snapshot(m){return JSON.parse(JSON.stringify(m))}
 function toolScope(principal,project,missionId=null){return Object.freeze({organizationId:project.orgId,projectId:project.id,actorId:principal.id,missionId})}
 function write(state,m,result=snapshot(m)){return {write:true,state,result}}
 function get({principal,project,missionId}){check(principal,project,'read');return transact(state=>({result:snapshot(find(state,missionId,project))}))}
 function create({principal,project,objective,goals,evidence,inputs,requestKey,maxWorkUnits}){
  check(principal,project,'create');if(typeof requestKey!=='string'||!ID.test(requestKey))throw Error('Mission request key required');
  const supplied=clone(inputs);
  if(!supplied||typeof supplied!=='object'||Array.isArray(supplied))throw Error('Mission inputs required');
  const plan=core.plan({principal,project,objective,goals,evidence,...(maxWorkUnits===undefined?{}:{maxWorkUnits})});
  if(plan.status!=='PLAN_PROPOSED')return {created:false,analysis:plan};
  const used=new Set(plan.steps.map(s=>s.capabilityId));if(Object.keys(supplied).some(k=>!used.has(k)))throw Error('Unused tool input');
  for(const step of plan.steps){const adapter=registry.get(step.capabilityId);if(!Object.hasOwn(supplied,step.capabilityId)||adapter.validate(clone(supplied[step.capabilityId]),{scope:toolScope(principal,project)})!==true)throw Error('Invalid tool input')}
  const digest=payloadDigest({objective,goals,evidence,inputs:supplied,maxWorkUnits:maxWorkUnits??null});
  return transact(state=>{
   const existing=state.missions.find(m=>m.orgId===project.orgId&&m.projectId===project.id&&m.requesterId===principal.id&&m.requestKey===requestKey);
   if(existing){if(existing.requestDigest!==digest)throw Error('Request key reused with different content');return {result:{created:false,mission:snapshot(existing)}}}
   if(state.missions.length>=maxMissions)throw Error('Mission storage capacity reached');
   const issued=time(),m={id:randomUUID(),version:0,orgId:project.orgId,projectId:project.id,requesterId:principal.id,requestKey,requestDigest:digest,workBudget:maxWorkUnits??1000000,objective,goals:[...goals],status:plan.steps.length?'queued':'completed',createdAt:issued,deadlineAt:issued+missionTtlMs,pauseRequested:false,cancelRequested:false,plan,inputs:supplied,tasks:plan.steps.map(s=>({...JSON.parse(JSON.stringify(s)),status:'pending',toolVersion:registry.get(s.capabilityId).version,toolFingerprint:registry.get(s.capabilityId).fingerprint,attemptId:null,attempts:[],result:null})),events:[]};
   event(m,principal,'created');state.missions.push(m);return write(state,m,{created:true,mission:snapshot(m)});
  });
 }
 function control({principal,project,missionId,expectedVersion},operation){
  check(principal,project,'control');
  return transact(state=>{
   const m=find(state,missionId,project);if(m.version!==expectedVersion)throw Error('Mission version conflict');
   if(['completed','cancelled','failed','unknown','timed_out','needs_replan'].includes(m.status))throw Error('Mission cannot be controlled in current state');
   if(operation==='resume'){if(m.status!=='paused')throw Error('Only paused missions may resume');m.pauseRequested=false;m.status='queued'}
   if(operation==='pause'){m.pauseRequested=true;if(m.status!=='running')m.status='paused'}
   if(operation==='cancel'){m.cancelRequested=true;if(m.status==='running')m.status='cancel_requested';else m.status='cancelled'}
   event(m,principal,operation);return write(state,m);
  });
 }
 function cancel(input){const m=control(input,'cancel');for(const task of m.tasks){const controller=active.get(task.attemptId);if(controller)controller.abort()}return m}
 async function runNext({principal,project,missionId,signal}){
  check(principal,project,'run');if(signal?.aborted)throw Error('Execution aborted before claim');
  const claim=transact(state=>{
   const m=find(state,missionId,project),running=m.tasks.find(t=>t.status==='running');
   if(running){
    if(time()>=running.leaseUntil){running.status='unknown';Object.assign(running.attempts.at(-1),{status:'unknown',reason:'lease_expired',finishedAt:time()});m.status='unknown';event(m,principal,'lease_expired',running.taskId);return write(state,m,{invoke:false,mission:snapshot(m)})}
    return {result:{invoke:false,mission:snapshot(m)}};
   }
   if(!['queued'].includes(m.status))return {result:{invoke:false,mission:snapshot(m)}};
   if(time()>=m.deadlineAt){m.status='timed_out';event(m,principal,'deadline_expired');return write(state,m,{invoke:false,mission:snapshot(m)})}
   const task=m.tasks.find(t=>t.status==='pending'&&t.dependsOn.every(id=>m.tasks.find(t=>t.taskId===id)?.status==='succeeded'));
   if(!task)throw Error('Mission dependency invariant failed');
   const adapter=registry.get(task.capabilityId);
   if(!adapter||adapter.fingerprint!==task.toolFingerprint){m.status='needs_replan';event(m,principal,'tool_version_changed',task.taskId);return write(state,m,{invoke:false,mission:snapshot(m)})}
   if(!['read','draft'].includes(adapter.risk)){m.status='awaiting_approval';event(m,principal,'consequential_execution_disabled',task.taskId);return write(state,m,{invoke:false,mission:snapshot(m)})}
   if(!principal.capabilityIds.includes(task.capabilityId))throw Error('Tool capability revoked');
   const spent=m.tasks.reduce((n,t)=>n+t.workUnits*t.attempts.length,0);
   if(spent+task.workUnits>(m.workBudget??1000000)){m.status='budget_exhausted';event(m,principal,'budget_exhausted',task.taskId);return write(state,m,{invoke:false,mission:snapshot(m)})}
   const attemptId=randomUUID();Object.assign(task,{status:'running',attemptId,leaseUntil:Math.min(time()+timeoutMs,m.deadlineAt)});task.attempts.push({attemptId,startedAt:time(),status:'running'});m.status='running';event(m,principal,'claimed',task.taskId);
   return write(state,m,{invoke:true,task:JSON.parse(JSON.stringify(task)),input:clone(m.inputs[task.capabilityId]),dependencies:m.tasks.filter(t=>task.dependsOn.includes(t.taskId)).map(t=>({taskId:t.taskId,capabilityId:t.capabilityId,result:clone(t.result)})),leaseUntil:task.leaseUntil});
  });
  if(!claim.invoke)return claim.mission;
  const controller=new AbortController();active.set(claim.task.attemptId,controller);
  let timer,abortHandler,result,verified=false,kind='unknown',revoked=false,failureReason='tool_error';
  const adapter=registry.get(claim.task.capabilityId);
  try{
   const interrupted=new Promise((_,reject)=>{abortHandler=()=>reject(Error('Execution interrupted'));controller.signal.addEventListener('abort',abortHandler,{once:true});timer=setTimeout(()=>{failureReason='timeout';controller.abort()},Math.max(1,claim.leaseUntil-time()))});
   const onExternalAbort=()=>{failureReason='cancelled';controller.abort()};if(signal)signal.addEventListener('abort',onExternalAbort,{once:true});
   try{
    if(signal?.aborted)controller.abort();
    const operation=Promise.resolve().then(()=>{
     if(controller.signal.aborted)throw Error('Aborted');
     check(principal,project,'run');
     const current=transact(state=>({result:snapshot(find(state,missionId,project))}));
     if(current.status!=='running'||current.tasks.find(t=>t.taskId===claim.task.taskId)?.attemptId!==claim.task.attemptId)throw Error('Stale execution claim');
     if(adapter.validateDependencies(clone(claim.dependencies))!==true)throw Error('Invalid dependency output');
     if(adapter.validate(clone(claim.input),{scope:toolScope(principal,project,missionId)})!==true)throw Error('Invalid tool input');
     return adapter.run({scope:toolScope(principal,project,missionId),idempotencyKey:missionId+':'+claim.task.taskId,input:clone(claim.input),dependencies:JSON.parse(JSON.stringify(claim.dependencies)),signal:controller.signal,attemptId:claim.task.attemptId});
    });
    result=clone(await Promise.race([operation,interrupted]));
    if(controller.signal.aborted)throw Error('Aborted');
    verified=(await Promise.race([Promise.resolve().then(()=>adapter.verify({scope:toolScope(principal,project,missionId),input:clone(claim.input),result:clone(result),dependencies:JSON.parse(JSON.stringify(claim.dependencies))})),interrupted]))===true;
    kind=verified?'succeeded':'failed';
   }finally{if(signal)signal.removeEventListener('abort',onExternalAbort)}
  }catch{kind='unknown'}finally{clearTimeout(timer);if(abortHandler)controller.signal.removeEventListener('abort',abortHandler);active.delete(claim.task.attemptId)}
  try{check(principal,project,'run');if(!principal.capabilityIds.includes(claim.task.capabilityId))throw Error('Revoked')}catch{revoked=true;kind='unknown'}
  const finished=transact(state=>{
   const m=find(state,missionId,project),task=m.tasks.find(t=>t.taskId===claim.task.taskId);
   if(task.status!=='running'||task.attemptId!==claim.task.attemptId)return {result:snapshot(m)};
   if(m.cancelRequested||time()>=claim.leaseUntil)kind='unknown';
   Object.assign(task.attempts.at(-1),{status:kind,reason:kind==='failed'?'output_rejected':kind==='unknown'?(revoked?'authorization_revoked':m.cancelRequested?'cancelled':failureReason):null,finishedAt:time()});task.status=kind;task.result=kind==='succeeded'?result:null;
   if(kind==='succeeded')task.resultDigest=payloadDigest(result);
   m.status=kind==='succeeded'?outcome(m):kind;event(m,principal,revoked?'authorization_revoked':kind,task.taskId);
   return write(state,m);
  });
  if(revoked)throw Error('Mission access denied after execution');return finished;
 }
 function retry({principal,project,missionId,expectedVersion,taskId}){
  check(principal,project,'control');return transact(state=>{
   const m=find(state,missionId,project),t=m.tasks.find(t=>t.taskId===taskId);
   if(m.version!==expectedVersion)throw Error('Mission version conflict');
   if(m.status!=='failed'||!t||t.status!=='failed'||t.attempts.length>=3||registry.get(t.capabilityId)?.retrySafe!==true||time()>=m.deadlineAt)throw Error('Retry denied');
   // Only a completed invocation whose output was rejected may retry. Unknown never replays.
   t.status='pending';m.status='queued';event(m,principal,'retry_requested',taskId);return write(state,m);
  });
 }
 function replan({principal,project,missionId,expectedVersion,evidence,inputs,maxWorkUnits}){
  check(principal,project,'replan');const supplied=clone(inputs);
  if(!supplied||typeof supplied!=='object'||Array.isArray(supplied))throw Error('Replan inputs required');
  return transact(state=>{
   const m=find(state,missionId,project);
   if(m.version!==expectedVersion)throw Error('Mission version conflict');
   if(m.status!=='failed'||m.cancelRequested||time()>=m.deadlineAt||(m.generation??1)>=3||m.tasks.some(t=>['running','unknown'].includes(t.status)))throw Error('Replan denied');
   const succeeded=m.tasks.filter(t=>t.status==='succeeded');
   for(const t of succeeded){if(registry.get(t.capabilityId)?.fingerprint!==t.toolFingerprint||!principal.capabilityIds.includes(t.capabilityId))throw Error('Successful evidence no longer trusted')}
   const excluded=new Set(m.tasks.filter(t=>t.status==='failed'||t.previousStatus==='failed').map(t=>t.capabilityId));
   const receipts=succeeded.flatMap((t,i)=>registry.get(t.capabilityId).produces.map((key,j)=>({id:'receipt_'+i+'_'+j,orgId:m.orgId,projectId:m.projectId,key,value:true,source:'verified-task:'+t.taskId+':'+t.resultDigest,verification:'verified'})));
   const remaining=(m.workBudget??1000000)-m.tasks.reduce((n,t)=>n+t.workUnits*t.attempts.length,0);
   if(maxWorkUnits!==undefined&&(!Number.isSafeInteger(maxWorkUnits)||maxWorkUnits<0||maxWorkUnits>remaining))throw Error('Replan budget increase denied');
   const plan=createNativeCore({capabilities:capabilities.filter(c=>!excluded.has(c.id))}).plan({principal,project,objective:m.objective,goals:m.goals,evidence:[...clone(evidence),...receipts],maxWorkUnits:maxWorkUnits??remaining});
   if(plan.status!=='PLAN_PROPOSED')return {result:{replanned:false,analysis:plan}};
   const used=new Set(plan.steps.map(t=>t.capabilityId));
   if(Object.keys(supplied).some(k=>!used.has(k)))throw Error('Unused replan input');
   for(const step of plan.steps)if(!Object.hasOwn(supplied,step.capabilityId)||registry.get(step.capabilityId).validate(clone(supplied[step.capabilityId]),{scope:toolScope(principal,project,missionId)})!==true)throw Error('Invalid replan input');
   const generation=(m.generation??1)+1,rename=id=>'g'+generation+'-'+id;
   for(const t of m.tasks)if(['failed','pending'].includes(t.status)){t.previousStatus=t.status;t.status='superseded'}
   const tasks=plan.steps.map(step=>({...snapshot(step),taskId:rename(step.taskId),dependsOn:[...step.dependsOn.map(rename),...succeeded.filter(t=>registry.get(t.capabilityId).produces.some(f=>registry.get(step.capabilityId).requires.includes(f))).map(t=>t.taskId)],status:'pending',toolVersion:registry.get(step.capabilityId).version,toolFingerprint:registry.get(step.capabilityId).fingerprint,attemptId:null,attempts:[],result:null}));
   m.planHistory=[...(m.planHistory??[]),m.plan];m.plan=plan;m.generation=generation;m.tasks.push(...tasks);Object.assign(m.inputs,supplied);m.status=tasks.length?'queued':outcome(m);event(m,principal,'replanned');return write(state,m,{replanned:true,mission:snapshot(m)});
  });
 }
 function reconcile({principal,project,missionId,expectedVersion,taskId,attemptId,result,evidenceReference}){
  check(principal,project,'reconcile');if(typeof evidenceReference!=='string'||!evidenceReference.trim()||evidenceReference.length>1000)throw Error('Recovery evidence required');
  const recovered=clone(result);
  return transact(state=>{
   const m=find(state,missionId,project);if(m.version!==expectedVersion)throw Error('Mission version conflict');
   const task=m.tasks.find(t=>t.taskId===taskId),adapter=task&&registry.get(task.capabilityId);
   if(m.status!=='unknown'||!task||task.status!=='unknown'||task.attemptId!==attemptId||!adapter||adapter.fingerprint!==task.toolFingerprint)throw Error('Invalid recovery target');
   const dependencies=m.tasks.filter(t=>task.dependsOn.includes(t.taskId)).map(t=>({taskId:t.taskId,capabilityId:t.capabilityId,result:clone(t.result)}));
   if(adapter.verify({scope:toolScope(principal,project,missionId),input:clone(m.inputs[task.capabilityId]),result:clone(recovered),dependencies})!==true)throw Error('Recovery verification failed');
   Object.assign(task.attempts.at(-1),{status:'reconciled',finishedAt:time(),evidenceReference});Object.assign(task,{status:'succeeded',result:recovered,resultDigest:payloadDigest(recovered),recoveryEvidence:evidenceReference});m.status=outcome(m);event(m,principal,'reconciled',taskId);return write(state,m);
  });
 }
 return Object.freeze({create,get,runNext,pause:x=>control(x,'pause'),resume:x=>control(x,'resume'),cancel,reconcile,retry,replan});
}
module.exports={createMissionRuntime};
