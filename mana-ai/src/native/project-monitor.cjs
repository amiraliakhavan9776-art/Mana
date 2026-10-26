'use strict';
const {canAccessProject}=require('../security.cjs');
const {payloadDigest}=require('../approval-store.cjs');
// Evidence-bound schedule monitoring. No inferred progress, resource changes or approvals.
function createProjectMonitor({authorize,verifyBaseline,verifyObservation}={}){
 if(![authorize,verifyBaseline,verifyObservation].every(x=>typeof x==='function'))throw Error('Trusted monitoring authorities required');
 return Object.freeze({assess({principal,project,schedule,observations,weights,asOf,maxAge=7,delayToleranceBps=500}){
  if(!canAccessProject(principal,project)||!principal.capabilityIds?.includes('native.project.monitor')||authorize(principal,'project.monitor',project)!==true)throw Error('Project monitoring denied');
  if(!Number.isSafeInteger(asOf)||asOf<0||asOf>1000000||!Number.isSafeInteger(maxAge)||maxAge<0||maxAge>1000000||!Number.isInteger(delayToleranceBps)||delayToleranceBps<0||delayToleranceBps>10000)throw Error('Explicit bounded monitoring clock required');
  if(!schedule||schedule.status!=='SCHEDULE_PROPOSED'||schedule.organizationId!==project.orgId||schedule.projectId!==project.id||!Array.isArray(schedule.tasks)||!schedule.tasks.length||schedule.tasks.length>128)throw Error('Scoped schedule required');
  const baseline=JSON.parse(JSON.stringify(schedule)),baselineDigest=payloadDigest(baseline);
  if(verifyBaseline({schedule:baseline,digest:baselineDigest,principal,project})!==true)throw Error('Current baseline not verified');
  const tasks=baseline.tasks,byId=new Map(tasks.map(t=>[t.id,t]));
  if(byId.size!==tasks.length||tasks.some(t=>typeof t.id!=='string'||!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(t.id)||!Number.isSafeInteger(t.start)||!Number.isSafeInteger(t.finish)||t.start<0||t.finish<=t.start||t.finish>1000000||!Array.isArray(t.dependsOn)||new Set(t.dependsOn).size!==t.dependsOn.length||t.dependsOn.some(id=>!byId.has(id)||id===t.id||byId.get(id).finish>t.start)))throw Error('Invalid baseline dependency/timing');
  if(!weights||typeof weights!=='object'||Array.isArray(weights)||Object.keys(weights).length!==tasks.length||tasks.some(t=>!Object.hasOwn(weights,t.id)||!Number.isSafeInteger(weights[t.id])||weights[t.id]<1||weights[t.id]>1000000))throw Error('Explicit task progress weights required');
  if(!Array.isArray(observations)||observations.length>128)throw Error('Bounded observations required');
  const observed=new Map(),evidenceDigests=[];
  for(const original of observations){
   if(!original||Object.keys(original).sort().join(',')!=='evidenceRef,observedAt,organizationId,progressBps,projectId,taskId'||original.organizationId!==project.orgId||original.projectId!==project.id||!byId.has(original.taskId)||observed.has(original.taskId)||!Number.isInteger(original.progressBps)||original.progressBps<0||original.progressBps>10000||!Number.isSafeInteger(original.observedAt)||original.observedAt<0||original.observedAt>asOf||typeof original.evidenceRef!=='string'||!original.evidenceRef.trim()||original.evidenceRef.length>200)throw Error('Invalid, duplicate or foreign progress evidence');
   const row=JSON.parse(JSON.stringify(original)),digest=payloadDigest(row);
   if(verifyObservation({observation:row,digest,principal,project})!==true)throw Error('Progress evidence not verified');
   observed.set(row.taskId,row);evidenceDigests.push(digest);
  }
  const issues=[],rows=tasks.map(t=>{
   const o=observed.get(t.id),fresh=o!==undefined&&asOf-o.observedAt<=maxAge;
   const plannedBps=asOf<=t.start?0:asOf>=t.finish?10000:Math.floor((asOf-t.start)*10000/(t.finish-t.start));
   const actualBps=fresh?o.progressBps:null;
   if(!fresh)issues.push({taskId:t.id,kind:o?'STALE_EVIDENCE':'MISSING_EVIDENCE',priority:1,proposal:'Obtain current verified progress before drawing conclusions.'});
   if(fresh&&actualBps>0){for(const dep of t.dependsOn){const d=observed.get(dep);if(!d||asOf-d.observedAt>maxAge||d.progressBps!==10000)issues.push({taskId:t.id,dependencyId:dep,kind:'DEPENDENCY_REVIEW_REQUIRED',priority:1,proposal:'Reconcile predecessor completion and work sequence with the responsible reviewer.'});}}
   if(fresh&&plannedBps-actualBps>delayToleranceBps)issues.push({taskId:t.id,kind:asOf>=t.finish?'OVERDUE':'BEHIND_BASELINE',priority:2,gapBps:plannedBps-actualBps,proposal:'Review blockers and propose a revised resource-feasible schedule; retain required approvals.'});
   return {taskId:t.id,plannedBps,actualBps,varianceBps:fresh?actualBps-plannedBps:null,evidenceStatus:fresh?'CURRENT':o?'STALE':'MISSING'};
  });
  const totalWeight=tasks.reduce((n,t)=>n+weights[t.id],0),complete=rows.every(r=>r.actualBps!==null);
  const weighted=field=>Math.floor(rows.reduce((n,r)=>n+r[field]*weights[r.taskId],0)/totalWeight);
  return {schema:'MANA_PROJECT_MONITOR_V1',status:!complete?'EVIDENCE_INCOMPLETE':issues.length?'REVIEW_REQUIRED':'ON_BASELINE_WITHIN_TOLERANCE',organizationId:project.orgId,projectId:project.id,asOf,baselineDigest,evidenceDigests,inputDigest:payloadDigest({baselineDigest,evidenceDigests,weights,asOf,maxAge,delayToleranceBps}),plannedProgressBps:weighted('plannedBps'),actualProgressBps:complete?weighted('actualBps'):null,progressMethod:'Explicit weighted progress with linear baseline interpolation; not earned value, cost, cash flow or a completion forecast.',tasks:rows,issues:issues.sort((a,b)=>a.priority-b.priority||a.taskId.localeCompare(b.taskId)),actionsExecuted:0,approved:false,productionDeploymentAllowed:false};
 }});
}
module.exports={createProjectMonitor};
