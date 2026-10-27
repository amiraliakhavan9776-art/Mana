'use strict';
// Bounded ordered HTN over trusted host methods; no language/model or effects.
const {createNativeCore}=require('./core.cjs');
const {canAccessProject}=require('../security.cjs');
const {payloadDigest}=require('../approval-store.cjs');
const ID=/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/;
function identifiers(xs,max=64){if(!Array.isArray(xs)||xs.length>max||xs.some(x=>typeof x!=='string'||!ID.test(x)))throw Error('Invalid task/fact identifiers');return [...xs];}
function createHierarchicalPlanner({capabilities,methods,maxStates=1000}){
 createNativeCore({capabilities}); // Reuse canonical descriptor validation.
 if(!Array.isArray(methods)||methods.length>64||!Number.isInteger(maxStates)||maxStates<1||maxStates>5000)throw Error('Invalid hierarchy budget');
 const catalog=JSON.parse(JSON.stringify(capabilities)),operators=new Map(catalog.map(c=>[c.id,c]));
 const templates=methods.map(m=>{if(!m||Object.keys(m).sort().join(',')!=='id,requires,subtasks,task'||!ID.test(m.id)||typeof m.id!=='string'||!ID.test(m.task)||typeof m.task!=='string')throw Error('Invalid method');return {id:m.id,task:m.task,requires:identifiers(m.requires),subtasks:identifiers(m.subtasks,16)};});
 if(new Set(templates.map(m=>m.id)).size!==templates.length||templates.some(m=>operators.has(m.task)||!m.subtasks.length))throw Error('Ambiguous or empty method');
 const abstract=new Set(templates.map(m=>m.task));
 for(const m of templates)for(const t of m.subtasks)if(!operators.has(t)&&!abstract.has(t))throw Error('Unknown hierarchy task');
 const depths=new Map(),visiting=new Set();
 function visit(task){if(visiting.has(task))throw Error('Cyclic hierarchy');if(depths.has(task))return depths.get(task);visiting.add(task);let depth=1;for(const m of templates.filter(m=>m.task===task))for(const next of m.subtasks)if(abstract.has(next))depth=Math.max(depth,1+visit(next));visiting.delete(task);if(depth>12)throw Error('Hierarchy depth');depths.set(task,depth);return depth;}
 for(const task of abstract)visit(task);
 const configurationDigest=payloadDigest({capabilities:catalog,methods:templates});
 function plan({principal,project,objective,tasks,goals,evidence,maxWorkUnits=1000000}){
  const roots=identifiers(tasks,16);if(!roots.length||roots.some(t=>!operators.has(t)&&!abstract.has(t)))throw Error('Unknown root task');
  if(!Number.isSafeInteger(maxWorkUnits)||maxWorkUnits<0||maxWorkUnits>32000000||typeof objective!=='string'||!objective.trim()||objective.length>1000||!canAccessProject(principal,project))throw Error('Hierarchy access/input denied');
  const target=identifiers(goals,32);if(!target.length)throw Error('Goals required');
  // Canonical evidence parser detects conflicts, duplicate IDs and invalid values.
  const check=createNativeCore({capabilities:[]}).plan({principal,project,objective,goals:target,evidence,maxWorkUnits:0});
  const base={engine:'MANA_ORDERED_HTN_V1',organizationId:project.orgId,projectId:project.id,configurationDigest,objective,goals:target,actionsExecuted:0,requiresHumanReview:true};
  if(check.status==='EVIDENCE_CONFLICT')return {...base,status:check.status,conflicts:check.conflicts};
  const rows=evidence.filter(e=>e.orgId===project.orgId&&e.projectId===project.id&&e.verification==='verified'&&e.value===true);
  const initial=new Set(rows.map(e=>e.key)),queue=[{remaining:roots,facts:initial,steps:[],trace:[],cost:0}];let expanded=0,best=null;
  while(queue.length){
   if(expanded++>=maxStates)return {...base,status:'SEARCH_LIMIT_REACHED',search:{expanded:maxStates,limit:maxStates}};
   const node=queue.shift();if(best&&node.cost>best.cost)continue;
   if(!node.remaining.length){if(target.every(g=>node.facts.has(g))&&(!best||node.cost<best.cost))best=node;continue;}
   const [task,...remaining]=node.remaining,operator=operators.get(task);
   if(operator){if(!principal.capabilityIds?.includes(task)||!operator.requires.every(f=>node.facts.has(f))||node.cost+operator.workUnits>maxWorkUnits||node.steps.length>=64)continue;
    queue.push({...node,remaining,cost:node.cost+operator.workUnits,steps:[...node.steps,task],facts:new Set([...node.facts,...operator.produces])});
   }else for(const method of templates.filter(m=>m.task===task).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
    if(!method.requires.every(f=>node.facts.has(f))||remaining.length+method.subtasks.length>128)continue;
    if(queue.length>=maxStates)return {...base,status:'SEARCH_LIMIT_REACHED',search:{expanded,limit:maxStates}};
    queue.push({...node,remaining:[...method.subtasks,...remaining],trace:[...node.trace,{task,methodId:method.id,requires:[...method.requires]}]});
   }
  }
  if(!best)return {...base,status:'NO_PLAN_WITHIN_CONSTRAINTS',search:{expanded,limit:maxStates}};
  const producers=new Map();const steps=best.steps.map((name,index)=>{const c=operators.get(name),taskId='task-'+(index+1),dependsOn=[...new Set([...(index?['task-'+index]:[]),...c.requires.map(f=>producers.get(f)).filter(Boolean)])];for(const fact of c.produces)producers.set(fact,taskId);return {taskId,index:index+1,dependsOn,capabilityId:c.id,title:c.title,requires:[...c.requires],simulatedEffects:[...c.produces],workUnits:c.workUnits,risk:c.risk,requiresApproval:['consequential','regulated'].includes(c.risk),requiresProfessionalSignoff:c.risk==='regulated',executed:false};});
  return {...base,status:'PLAN_PROPOSED',steps,wbs:steps.map(s=>({id:s.taskId,title:s.title,dependsOn:s.dependsOn,workUnits:s.workUnits,status:'proposed',requiresApproval:s.requiresApproval,requiresProfessionalSignoff:s.requiresProfessionalSignoff})),methodTrace:best.trace,totalWorkUnits:best.cost,evidenceIds:rows.map(e=>e.id).sort(),search:{expanded,limit:maxStates,optimalWithin:'configured acyclic ordered methods, grants, positive facts and work-unit budget'}};
 }
 return Object.freeze({plan,configurationDigest});
}
module.exports={createHierarchicalPlanner};
