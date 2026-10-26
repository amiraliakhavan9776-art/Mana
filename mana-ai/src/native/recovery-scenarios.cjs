'use strict';
const {canAccessProject}=require('../security.cjs');
const {payloadDigest}=require('../approval-store.cjs');
function createRecoveryScenarioComparator({planner,authorize}={}){
 if(!planner||typeof planner.propose!=='function'||typeof authorize!=='function')throw Error('Trusted scenario planning host required');
 return Object.freeze({compare({principal,project,input,scenarios}){
  if(!canAccessProject(principal,project)||!principal.capabilityIds?.includes('native.recovery.scenarios')||authorize(principal,'recovery.scenarios',project)!==true)throw Error('Recovery scenario access denied');
  if(!Array.isArray(scenarios)||!scenarios.length||scenarios.length>8)throw Error('One to eight explicit scenarios required');
  const ids=new Set();for(const s of scenarios){if(!s||Object.keys(s).sort().join(',')!=='capacities,id,remainingEstimates'||typeof s.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(s.id)||ids.has(s.id))throw Error('Invalid or duplicate recovery scenario');ids.add(s.id);}
  const sourceDigest=payloadDigest(input),rows=[];let binding=null;
  const base={schema:'MANA_RECOVERY_SCENARIOS_V1',organizationId:project.orgId,projectId:project.id,sourceDigest,inputDigest:payloadDigest({sourceDigest,scenarios:scenarios.map(s=>({id:s.id,digest:payloadDigest(s)}))}),actionsExecuted:0,approved:false,baselineChanged:false,productionDeploymentAllowed:false};
  for(const scenario of scenarios){
   const proposal=planner.propose({...input,principal,project,remainingEstimates:scenario.remainingEstimates,capacities:scenario.capacities});
   const currentBinding=payloadDigest({baselineDigest:proposal.baselineDigest,assessmentDigest:proposal.assessmentDigest,asOf:proposal.asOf});
   if(binding!==null&&binding!==currentBinding)throw Error('Scenario evidence changed during comparison');binding=currentBinding;
   if(proposal.status==='EVIDENCE_RECONCILIATION_REQUIRED')return {...base,status:'EVIDENCE_RECONCILIATION_REQUIRED',scenarios:[],earliestFinishScenarioIds:[],nonDominatedScenarioIds:[]};
   if(proposal.status==='NO_REMAINING_WORK')return {...base,status:'NO_REMAINING_WORK',scenarios:[],earliestFinishScenarioIds:[],nonDominatedScenarioIds:[]};
   if(proposal.status==='NO_SCHEDULE_WITHIN_HORIZON'){rows.push({id:scenario.id,status:proposal.status,proposalDigest:payloadDigest(proposal)});continue;}
   if(proposal.status!=='RECOVERY_SCHEDULE_PROPOSED')throw Error('Unsupported recovery proposal');
   const resourceIds=[...new Set(proposal.tasks.flatMap(t=>Object.keys(t.resources)))].sort(),resourceEffort={},peakResourceDemand={};
   for(const id of resourceIds){
    resourceEffort[id]=proposal.tasks.reduce((n,t)=>n+t.duration*(Object.hasOwn(t.resources,id)?t.resources[id]:0),0);
    peakResourceDemand[id]=Math.max(0,...proposal.tasks.map(t=>t.start).map(at=>proposal.tasks.filter(t=>t.start<=at&&at<t.finish).reduce((n,t)=>n+(Object.hasOwn(t.resources,id)?t.resources[id]:0),0)));
   }
   rows.push({id:scenario.id,status:proposal.status,proposalDigest:payloadDigest(proposal),makespan:proposal.makespan,finishVariance:proposal.makespan-proposal.baselineMakespan,resourceEffort,peakResourceDemand,requiresApprovalTaskIds:proposal.tasks.filter(t=>t.requiresApproval).map(t=>t.id),requiresProfessionalSignoffTaskIds:proposal.tasks.filter(t=>t.requiresProfessionalSignoff).map(t=>t.id)});
  }
  const feasible=rows.filter(r=>r.status==='RECOVERY_SCHEDULE_PROPOSED'),resources=[...new Set(feasible.flatMap(r=>Object.keys(r.resourceEffort)))].sort();
  function dominates(a,b){const pairs=[[a.makespan,b.makespan],...resources.flatMap(id=>[[Object.hasOwn(a.resourceEffort,id)?a.resourceEffort[id]:0,Object.hasOwn(b.resourceEffort,id)?b.resourceEffort[id]:0],[Object.hasOwn(a.peakResourceDemand,id)?a.peakResourceDemand[id]:0,Object.hasOwn(b.peakResourceDemand,id)?b.peakResourceDemand[id]:0]])];return pairs.every(([a,b])=>a<=b)&&pairs.some(([a,b])=>a<b);}
  for(const row of feasible)row.dominatedByScenarioIds=feasible.filter(other=>other!==row&&dominates(other,row)).map(r=>r.id).sort();
  const earliest=feasible.length?Math.min(...feasible.map(r=>r.makespan)):null;
  return {...base,status:feasible.length?'SCENARIOS_COMPARED':'NO_FEASIBLE_SCENARIO',scenarios:rows,earliestFinishScenarioIds:feasible.filter(r=>r.makespan===earliest).map(r=>r.id).sort(),nonDominatedScenarioIds:feasible.filter(r=>!r.dominatedByScenarioIds.length).map(r=>r.id).sort(),comparisonMethod:'Pareto comparison of finish time, separate resource effort and separate peak resource demand. Resources are not converted to money or combined into one score. No automatic scenario selection or optimality claim.'};
 }});
}
module.exports={createRecoveryScenarioComparator};
