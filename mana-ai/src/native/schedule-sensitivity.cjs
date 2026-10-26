'use strict';
const {canAccessProject}=require('../security.cjs');
const {payloadDigest}=require('../approval-store.cjs');
const {scheduleProject}=require('./resource-scheduler.cjs');
function createScheduleSensitivity({authorize,verifyInputs}={}){
 if(typeof authorize!=='function'||typeof verifyInputs!=='function')throw Error('Trusted schedule analysis host required');
 return Object.freeze({analyze({principal,project,tasks,capacities,horizon=1000000,taskIds,delayUnits}){
  if(!canAccessProject(principal,project)||!principal.capabilityIds?.includes('native.schedule.analyze')||authorize(principal,'schedule.analyze',project)!==true)throw Error('Schedule analysis denied');
  if(!Array.isArray(taskIds)||!taskIds.length||taskIds.length>16||new Set(taskIds).size!==taskIds.length||!Number.isInteger(delayUnits)||delayUnits<1||delayUnits>10000)throw Error('One to sixteen tasks and explicit positive delay required');
  const input={tasks,capacities,horizon,taskIds,delayUnits},inputDigest=payloadDigest(input),snapshot=JSON.parse(JSON.stringify(input));
  if(verifyInputs({input:JSON.parse(JSON.stringify(snapshot)),digest:inputDigest,principal,project})!==true)throw Error('Current schedule inputs not verified');
  const baseline=scheduleProject({principal,project,tasks:snapshot.tasks,capacities:snapshot.capacities,horizon:snapshot.horizon});
  const base={schema:'MANA_SCHEDULE_SENSITIVITY_V1',organizationId:project.orgId,projectId:project.id,inputDigest,delayUnits,actionsExecuted:0,approved:false,baselineChanged:false,productionDeploymentAllowed:false};
  if(baseline.status!=='SCHEDULE_PROPOSED')return {...base,status:'BASELINE_INFEASIBLE',analyses:[]};
  const byId=new Map(baseline.tasks.map(t=>[t.id,t]));if(snapshot.taskIds.some(id=>!byId.has(id)))throw Error('Unknown sensitivity task');
  // Reconstruct precedence-only CPM independently from resource scheduling offsets.
  const order=[],pending=new Set(byId.keys()),earliest=new Map(),latest=new Map();
  while(pending.size){const ready=[...pending].filter(id=>byId.get(id).dependsOn.every(dep=>!pending.has(dep))).sort();if(!ready.length)throw Error('Invalid dependency network');for(const id of ready){pending.delete(id);order.push(id);const task=byId.get(id),start=Math.max(0,...task.dependsOn.map(dep=>earliest.get(dep).finish));earliest.set(id,{start,finish:start+task.duration});}}
  const precedenceMakespan=Math.max(...[...earliest.values()].map(t=>t.finish));
  for(const id of [...order].reverse()){const successors=baseline.tasks.filter(t=>t.dependsOn.includes(id)),finish=successors.length?Math.min(...successors.map(t=>latest.get(t.id).start)):precedenceMakespan;latest.set(id,{start:finish-byId.get(id).duration,finish});}
  const analyses=snapshot.taskIds.map(id=>{
   const original=byId.get(id),precedenceFloat=latest.get(id).start-earliest.get(id).start;
   const row={taskId:id,originalDuration:original.duration,delayedDuration:original.duration+snapshot.delayUnits,precedenceEarliestStart:earliest.get(id).start,precedenceLatestStart:latest.get(id).start,precedenceFloat,onPrecedenceCriticalPath:precedenceFloat===0,scheduledStart:original.start,resourceStartDelay:original.start-earliest.get(id).start,precedenceFinishIncrease:Math.max(0,snapshot.delayUnits-precedenceFloat)};
   if(row.delayedDuration>snapshot.horizon)return {...row,status:'NO_SCHEDULE_WITHIN_HORIZON',finishChange:null};
   const perturbed=scheduleProject({principal,project,tasks:snapshot.tasks.map(t=>t.id===id?{...t,duration:row.delayedDuration}:t),capacities:snapshot.capacities,horizon:snapshot.horizon});
   if(perturbed.status!=='SCHEDULE_PROPOSED')return {...row,status:perturbed.status,finishChange:null};
   const finishChange=perturbed.makespan-baseline.makespan;
   return {...row,status:finishChange<0?'HEURISTIC_REORDERING_REVIEW':finishChange>0?'DELAY_SENSITIVE_IN_THIS_RUN':'DELAY_ABSORBED_IN_THIS_RUN',perturbedMakespan:perturbed.makespan,finishChange,perturbedScheduleDigest:payloadDigest(perturbed)};
  });
  const attention=[...analyses].sort((a,b)=>(Number(b.finishChange===null)-Number(a.finishChange===null))||((b.finishChange??0)-(a.finishChange??0))||a.precedenceFloat-b.precedenceFloat||(a.taskId<b.taskId?-1:a.taskId>b.taskId?1:0));
  return {...base,status:'SENSITIVITY_ANALYZED',baselineDigest:payloadDigest(baseline),baselineMakespan:baseline.makespan,precedenceMakespan,analyses,attentionOrderTaskIds:attention.map(t=>t.taskId),unprobedTaskIds:baseline.tasks.filter(t=>!snapshot.taskIds.includes(t.id)).map(t=>t.id),method:'Independent one-task duration perturbations with unchanged capacities; deterministic heuristic rescheduling. CPM float ignores resources. Results are conditional sensitivity, not delay probabilities or an optimal critical-chain proof.'};
 }});
}
module.exports={createScheduleSensitivity};
