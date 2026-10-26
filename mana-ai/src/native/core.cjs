'use strict';
// MANA-owned constrained symbolic planning/evaluation. No provider, network or tools.
const {canAccessProject}=require('../security.cjs');
const ID=/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/;
const KEY=/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/;
const RISK=new Set(['read','draft','consequential','regulated']);
function id(value){if(typeof value!=='string'||!ID.test(value))throw Error('Invalid identifier');return value}
function text(value,max=1000){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Invalid text');return value.trim()}
function list(value,max){if(!Array.isArray(value)||value.length>max)throw Error('Invalid bounded list');return value}
function fields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw Error('Unexpected input fields');return value}
function ids(value,max=128){const result=list(value,max).map(id);if(new Set(result).size!==result.length)throw Error('Duplicate identifier');return result}
function integer(value,min,max){if(!Number.isSafeInteger(value)||value<min||value>max)throw Error('Invalid integer bound');return value}
function finite(value){if(typeof value!=='number'||!Number.isFinite(value))throw Error('Finite number required');return value}
function authorize(principal,project){
 if(!project||typeof project.id!=='string'||typeof project.orgId!=='string'||!principal||typeof principal.id!=='string'||!canAccessProject(principal,project))throw Error('Project access denied');
 return {organizationId:project.orgId,projectId:project.id};
}
function ledger(evidence,scope){
 const byId=new Map(),byKey=new Map();
 for(const row of list(evidence,500)){
  if(!row||row.orgId!==scope.organizationId||row.projectId!==scope.projectId)continue;
  fields(row,['id','orgId','projectId','key','value','source','verification']);
  id(row.id);if(typeof row.key!=='string'||!KEY.test(row.key))throw Error('Invalid evidence key');
  if(typeof row.value!=='boolean')finite(row.value);
  const source=text(row.source);
  if(!['verified','unverified'].includes(row.verification)||byId.has(row.id))throw Error('Invalid evidence verification or duplicate ID');
  const item={id:row.id,key:row.key,value:row.value,source,verification:row.verification};
  byId.set(item.id,item);
  if(item.verification==='verified')byKey.set(item.key,[...(byKey.get(item.key)||[]),item]);
 }
 const conflicts=[...byKey].filter(([,rows])=>new Set(rows.map(r=>JSON.stringify(r.value))).size>1).map(([key,rows])=>({key,evidenceIds:rows.map(r=>r.id).sort()})).sort((a,b)=>compareId(a.key,b.key));
 return {byId,byKey,conflicts};
}
function compareId(a,b){return a<b?-1:a>b?1:0}
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value)}return value}
function frontier(){
 const heap=[],before=(a,b)=>a.cost<b.cost||(a.cost===b.cost&&a.order<b.order);
 return {
  get length(){return heap.length},
  push(value){let i=heap.push(value)-1;while(i){const parent=(i-1)>>1;if(!before(heap[i],heap[parent]))break;[heap[i],heap[parent]]=[heap[parent],heap[i]];i=parent}},
  pop(){
   const first=heap[0],last=heap.pop();
   if(heap.length){heap[0]=last;let i=0;while(true){let next=i,left=i*2+1,right=left+1;if(left<heap.length&&before(heap[left],heap[next]))next=left;if(right<heap.length&&before(heap[right],heap[next]))next=right;if(next===i)break;[heap[i],heap[next]]=[heap[next],heap[i]];i=next}}
   return first;
  }
 };
}
function createNativeCore({capabilities=[],maxStates=2000}={}){
 integer(maxStates,1,5000);
 const catalog=list(capabilities,32).map(c=>{
  fields(c,['id','title','requires','produces','workUnits','risk']);
  return freeze({id:id(c.id),title:text(c.title,200),requires:ids(c.requires),produces:ids(c.produces),workUnits:integer(c.workUnits,0,1000000),risk:RISK.has(c.risk)?c.risk:(()=>{throw Error('Invalid capability risk')})()});
 }).sort((a,b)=>compareId(a.id,b.id));
 if(new Set(catalog.map(c=>c.id)).size!==catalog.length)throw Error('Duplicate capability');
 const configuredFacts=new Set(catalog.flatMap(c=>[...c.requires,...c.produces]));
 if(configuredFacts.size>128)throw Error('Capability fact vocabulary exceeds bound');
 function result(scope,status,details){return freeze({engine:'MANA_NATIVE_SYMBOLIC_CORE',version:'0.1.0',...scope,status,...details,actionsExecuted:0,requiresHumanReview:true})}
 function plan(input){
  fields(input,['principal','project','objective','goals','evidence','maxWorkUnits']);
  const scope=authorize(input.principal,input.project),objective=text(input.objective),goals=ids(input.goals,32);
  if(!goals.length)throw Error('At least one goal required');
  const maxWorkUnits=integer(input.maxWorkUnits??1000000,0,32000000),facts=ledger(input.evidence,scope);
  if(facts.conflicts.length)return result(scope,'EVIDENCE_CONFLICT',{objective,conflicts:facts.conflicts});
  const grants=Array.isArray(input.principal.capabilityIds)?input.principal.capabilityIds:[];
  const usable=catalog.filter(c=>grants.includes(c.id));
  const relevant=new Set([...configuredFacts,...goals]);
  const initial=new Set([...facts.byKey].filter(([key,rows])=>relevant.has(key)&&rows[0].value===true).map(([key])=>key));
  const keyFor=state=>JSON.stringify([...state].sort());
  const queue=frontier(),best=new Map([[keyFor(initial),0]]);
  queue.push({state:initial,cost:0,steps:[],order:0});
  let expanded=0,order=0;
  while(queue.length){
   const node=queue.pop(),key=keyFor(node.state);
   if(node.cost!==best.get(key))continue;
   if(goals.every(g=>node.state.has(g))){
    const producers=new Map(),known=new Set(initial);
    const steps=node.steps.map((capabilityId,index)=>{
     const c=catalog.find(c=>c.id===capabilityId);
     const taskId='task-'+(index+1),dependsOn=[...new Set(c.requires.map(f=>producers.get(f)).filter(Boolean))];
     for(const fact of c.produces)if(!known.has(fact)){known.add(fact);producers.set(fact,taskId)}
     return {taskId,index:index+1,dependsOn,capabilityId,title:c.title,requires:[...c.requires],simulatedEffects:[...c.produces],workUnits:c.workUnits,risk:c.risk,requiresApproval:['consequential','regulated'].includes(c.risk),requiresProfessionalSignoff:c.risk==='regulated',executed:false};
    });
    const evidenceIds=[...facts.byKey.values()].flat().filter(r=>r.value===true&&initial.has(r.key)).map(r=>r.id).sort();
    const wbs=steps.map(s=>({id:s.taskId,title:s.title,dependsOn:[...s.dependsOn],workUnits:s.workUnits,status:'proposed',requiresApproval:s.requiresApproval,requiresProfessionalSignoff:s.requiresProfessionalSignoff}));
    return result(scope,'PLAN_PROPOSED',{objective,goals,steps,wbs,totalWorkUnits:node.cost,evidenceIds,search:{expanded,limit:maxStates,optimalWithin:'configured monotonic capabilities and work-unit budget'}});
   }
   if(expanded>=maxStates)return result(scope,'SEARCH_LIMIT_REACHED',{objective,unsatisfiedGoals:goals.filter(g=>!initial.has(g)),search:{expanded,limit:maxStates}});
   expanded++;
   for(const c of usable){
    if(!c.requires.every(f=>node.state.has(f))||c.produces.every(f=>node.state.has(f))||node.cost+c.workUnits>maxWorkUnits)continue;
    const next=new Set([...node.state,...c.produces]),nextKey=keyFor(next),cost=node.cost+c.workUnits;
    if(best.has(nextKey)&&best.get(nextKey)<=cost)continue;
    if(!best.has(nextKey)&&best.size>=maxStates)return result(scope,'SEARCH_LIMIT_REACHED',{objective,search:{expanded,generated:best.size,limit:maxStates}});
    best.set(nextKey,cost);queue.push({state:next,cost,steps:[...node.steps,c.id],order:++order});
   }
  }
  return result(scope,'NO_PLAN_WITHIN_CONSTRAINTS',{objective,unsatisfiedGoals:goals.filter(g=>!initial.has(g)),search:{expanded,limit:maxStates}});
 }
 function evaluate(input){
  fields(input,['principal','project','criteria','alternatives','evidence']);
  const scope=authorize(input.principal,input.project),facts=ledger(input.evidence,scope);
  const criteria=list(input.criteria,16).map(c=>{
   fields(c,['id','weight','direction','min','max','requiredMin','requiredMax']);
   id(c.id);integer(c.weight,1,100);finite(c.min);finite(c.max);
   if(c.max<=c.min||!Number.isFinite(c.max-c.min)||!['maximize','minimize'].includes(c.direction))throw Error('Invalid criterion range');
   if(c.requiredMin!==undefined&&(finite(c.requiredMin)<c.min||c.requiredMin>c.max))throw Error('Invalid veto threshold');
   if(c.requiredMax!==undefined&&(finite(c.requiredMax)>c.max||c.requiredMax<c.min))throw Error('Invalid veto threshold');
   if(c.requiredMin!==undefined&&c.requiredMax!==undefined&&c.requiredMin>c.requiredMax)throw Error('Invalid veto interval');
   return {...c};
  });
  if(!criteria.length||new Set(criteria.map(c=>c.id)).size!==criteria.length)throw Error('Unique criteria required');
  const alternatives=list(input.alternatives,32);if(!alternatives.length)throw Error('Alternatives required');
  const seen=new Set(),weight=criteria.reduce((n,c)=>n+c.weight,0);
  const rankings=alternatives.map(a=>{
   fields(a,['id','label','assessments']);id(a.id);text(a.label,200);
   if(seen.has(a.id))throw Error('Duplicate alternative');seen.add(a.id);
   const scores=new Map();for(const s of list(a.assessments,16)){
    fields(s,['criterionId','value','evidenceIds']);id(s.criterionId);finite(s.value);ids(s.evidenceIds,16);
    if(scores.has(s.criterionId)||!criteria.some(c=>c.id===s.criterionId))throw Error('Unknown or repeated assessment');scores.set(s.criterionId,s);
   }
   let total=0;const blockers=[],breakdown=[];
   for(const c of criteria){
    const score=scores.get(c.id),key=a.id+':'+c.id;
    if(!score){blockers.push({criterionId:c.id,reason:'missing_assessment'});continue}
    const sources=score.evidenceIds.map(eid=>facts.byId.get(eid));
    if(!sources.length||sources.some(e=>!e||e.verification!=='verified'||e.key!==key||e.value!==score.value)||facts.conflicts.some(x=>x.key===key)){
     blockers.push({criterionId:c.id,reason:'missing_unverified_or_conflicting_evidence'});continue;
    }
    if(score.value<c.min||score.value>c.max){blockers.push({criterionId:c.id,reason:'out_of_range'});continue}
    if((c.requiredMin!==undefined&&score.value<c.requiredMin)||(c.requiredMax!==undefined&&score.value>c.requiredMax))blockers.push({criterionId:c.id,reason:'hard_constraint_veto'});
    const normalized=(c.direction==='maximize'?score.value-c.min:c.max-score.value)/(c.max-c.min);
    total+=normalized*c.weight;
    breakdown.push({criterionId:c.id,value:score.value,weightedContribution:Math.round(normalized*c.weight*1000000)/1000000,evidenceIds:[...score.evidenceIds]});
   }
   return {id:a.id,label:a.label,eligible:blockers.length===0,score:blockers.length?null:Math.round(total/weight*1000000)/1000000,breakdown,blockers};
  }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||(b.score??-1)-(a.score??-1)||compareId(a.id,b.id));
  const eligible=rankings.filter(r=>r.eligible),leaders=eligible.filter(r=>r.score===eligible[0]?.score).map(r=>r.id);
  return result(scope,!eligible.length?'NO_ADMISSIBLE_OPTION':leaders.length>1?'TIED_REQUIRES_REVIEW':'DECISION_PROPOSED',{criteria,recommendedId:leaders.length===1?leaders[0]:null,tiedIds:leaders.length>1?leaders:[],rankings,method:'evidence-bound weighted criteria with non-overridable hard constraints',weightsSource:'caller-supplied, not inferred preferences'});
 }
 return Object.freeze({plan,evaluate});
}
module.exports={createNativeCore};
