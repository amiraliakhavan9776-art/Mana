'use strict';
// Offline deterministic scheduling proposals, not reservations or execution.
const {canAccessProject}=require('../security.cjs');
const {payloadDigest}=require('../approval-store.cjs');
const ID=/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/;
function scheduleProject({principal,project,tasks,capacities,horizon=1000000}){
 if(!canAccessProject(principal,project)||!principal.capabilityIds?.includes('native.schedule.propose'))throw Error('Schedule access denied');
 if(!Array.isArray(tasks)||!tasks.length||tasks.length>128||!capacities||typeof capacities!=='object'||Array.isArray(capacities)||Object.keys(capacities).length>16||!Number.isSafeInteger(horizon)||horizon<1||horizon>1000000)throw Error('Bounded schedule contract required');
 for(const [name,capacity] of Object.entries(capacities))if(!ID.test(name)||!Number.isSafeInteger(capacity)||capacity<1||capacity>1000)throw Error('Invalid resource capacity');
 const rows=tasks.map(t=>{if(!t||Object.keys(t).sort().join(',')!=='dependsOn,duration,id,resources'||typeof t.id!=='string'||!ID.test(t.id)||!Number.isSafeInteger(t.duration)||t.duration<1||t.duration>horizon||!Array.isArray(t.dependsOn)||t.dependsOn.length>128||new Set(t.dependsOn).size!==t.dependsOn.length||!t.resources||typeof t.resources!=='object'||Array.isArray(t.resources))throw Error('Invalid schedule task');
  for(const [name,amount] of Object.entries(t.resources))if(!Object.hasOwn(capacities,name)||!Number.isSafeInteger(amount)||amount<1||amount>capacities[name])throw Error('Resource demand exceeds capacity');
  return JSON.parse(JSON.stringify(t));});
 const byId=new Map(rows.map(t=>[t.id,t]));if(byId.size!==rows.length||rows.some(t=>t.dependsOn.some(id=>!byId.has(id)||id===t.id)))throw Error('Invalid task dependency');
 const topological=[],pending=new Set(byId.keys());
 while(pending.size){const ready=[...pending].filter(id=>byId.get(id).dependsOn.every(dep=>!pending.has(dep))).sort();if(!ready.length)throw Error('Cyclic task dependencies');for(const id of ready){pending.delete(id);topological.push(id);}}
 const earliest=new Map(),remaining=new Map();
 for(const id of topological){const task=byId.get(id),start=Math.max(0,...task.dependsOn.map(dep=>earliest.get(dep).finish));earliest.set(id,{start,finish:start+task.duration});}
 for(const id of [...topological].reverse()){const successors=rows.filter(t=>t.dependsOn.includes(id));remaining.set(id,byId.get(id).duration+Math.max(0,...successors.map(t=>remaining.get(t.id))));}
 const criticalLowerBound=Math.max(...[...earliest.values()].map(x=>x.finish)),scheduled=new Map(),unplaced=new Set(byId.keys());let eventsChecked=0;
 while(unplaced.size){
  const ready=[...unplaced].filter(id=>byId.get(id).dependsOn.every(dep=>scheduled.has(dep))).sort((a,b)=>remaining.get(b)-remaining.get(a)||(a<b?-1:a>b?1:0)),id=ready[0],task=byId.get(id);
  let start=Math.max(0,...task.dependsOn.map(dep=>scheduled.get(dep).finish)),placed=false;
  while(start+task.duration<=horizon){
   // Resource usage changes only at interval boundaries, not on each time tick.
   const overlap=[...scheduled.values()].filter(t=>t.start<start+task.duration&&t.finish>start);
   const boundaries=[...new Set([start,...overlap.flatMap(t=>[t.start,t.finish]).filter(x=>x>start&&x<start+task.duration)])].sort((a,b)=>a-b);
   let conflict=null;
   for(const at of boundaries){if(++eventsChecked>100000)throw Error('Scheduling search budget exceeded');const active=overlap.filter(t=>t.start<=at&&t.finish>at);if(Object.entries(task.resources).some(([name,amount])=>amount+active.reduce((sum,t)=>sum+(Object.hasOwn(t.resources,name)?t.resources[name]:0),0)>capacities[name])){conflict=at;break;}}
   if(conflict===null){scheduled.set(id,{id,start,finish:start+task.duration,duration:task.duration,dependsOn:task.dependsOn,resources:task.resources});placed=true;break;}
   const next=overlap.filter(t=>t.finish>conflict).map(t=>t.finish);if(!next.length)break;start=Math.min(...next);
  }
  if(!placed)return {status:'NO_SCHEDULE_WITHIN_HORIZON',organizationId:project.orgId,projectId:project.id,actionsExecuted:0,approved:false};
  unplaced.delete(id);
 }
 const result=[...scheduled.values()].sort((a,b)=>a.start-b.start||(a.id<b.id?-1:1));
 return {schema:'MANA_RESOURCE_SCHEDULE_V1',status:'SCHEDULE_PROPOSED',organizationId:project.orgId,projectId:project.id,inputDigest:payloadDigest({tasks:rows,capacities,horizon}),tasks:result,makespan:Math.max(...result.map(t=>t.finish)),precedenceLowerBound:criticalLowerBound,method:'deterministic serial generation, descending remaining precedence length; no optimality claim',timeUnit:'caller-defined relative units; not dates or inferred staffing',actionsExecuted:0,approved:false};
}
function scheduleMissionPlan({principal,project,plan,estimates,capacities,horizon}){
 if(!plan||plan.status!=='PLAN_PROPOSED'||plan.organizationId!==project?.orgId||plan.projectId!==project?.id||!Array.isArray(plan.steps)||!estimates||typeof estimates!=='object'||Array.isArray(estimates)||Object.keys(estimates).length!==plan.steps.length)throw Error('Scoped mission plan and explicit estimates required');
 const tasks=plan.steps.map(step=>{const estimate=Object.hasOwn(estimates,step.taskId)?estimates[step.taskId]:null;if(!estimate||Object.keys(estimate).sort().join(',')!=='duration,resources')throw Error('Every task needs explicit duration/resource estimates');return {id:step.taskId,duration:estimate.duration,resources:estimate.resources,dependsOn:[...step.dependsOn]};});
 const result=scheduleProject({principal,project,tasks,capacities,...(horizon===undefined?{}:{horizon})});
 if(result.status!=='SCHEDULE_PROPOSED')return result;
 return {...result,planDigest:payloadDigest(plan),tasks:result.tasks.map(row=>{const step=plan.steps.find(s=>s.taskId===row.id);return {...row,capabilityId:step.capabilityId,requiresApproval:step.requiresApproval===true,requiresProfessionalSignoff:step.requiresProfessionalSignoff===true};})};
}
module.exports={scheduleProject,scheduleMissionPlan};
