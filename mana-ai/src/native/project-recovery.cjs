'use strict';
const {canAccessProject}=require('../security.cjs');
const {payloadDigest}=require('../approval-store.cjs');
const {scheduleProject}=require('./resource-scheduler.cjs');
// A revised schedule proposal, never a replacement baseline or an execution command.
function createProjectRecoveryPlanner({monitor,authorize,verifyEstimates}={}){
 if(!monitor||typeof monitor.assess!=='function'||typeof authorize!=='function'||typeof verifyEstimates!=='function')throw Error('Trusted recovery planning host required');
 return Object.freeze({propose(input){
  const {principal,project,schedule,remainingEstimates,capacities,horizon=1000000}=input;
  if(!canAccessProject(principal,project)||!principal.capabilityIds?.includes('native.project.replan')||!principal.capabilityIds?.includes('native.schedule.propose')||authorize(principal,'project.replan',project)!==true)throw Error('Project recovery access denied');
  const assessment=monitor.assess(input);
  const base={schema:'MANA_PROJECT_RECOVERY_V1',organizationId:project.orgId,projectId:project.id,baselineDigest:assessment.baselineDigest,assessmentDigest:payloadDigest(assessment),asOf:assessment.asOf,actionsExecuted:0,approved:false,baselineChanged:false,productionDeploymentAllowed:false};
  if(assessment.status==='EVIDENCE_INCOMPLETE'||assessment.issues.some(i=>i.kind==='DEPENDENCY_REVIEW_REQUIRED'))return {...base,status:'EVIDENCE_RECONCILIATION_REQUIRED',tasks:[]};
  if(!Number.isSafeInteger(horizon)||horizon<=assessment.asOf||horizon>1000000)throw Error('Explicit future recovery horizon required');
  const completed=new Set(assessment.tasks.filter(t=>t.actualBps===10000).map(t=>t.taskId)),pending=schedule.tasks.filter(t=>!completed.has(t.id));
  if(!remainingEstimates||typeof remainingEstimates!=='object'||Array.isArray(remainingEstimates)||Object.keys(remainingEstimates).length!==pending.length)throw Error('Explicit estimates for exactly the unfinished tasks required');
  const tasks=pending.map(t=>{const estimate=Object.hasOwn(remainingEstimates,t.id)?remainingEstimates[t.id]:null;if(!estimate||Object.keys(estimate).sort().join(',')!=='duration,resources')throw Error('Every unfinished task needs a remaining estimate');return {id:t.id,duration:estimate.duration,resources:estimate.resources,dependsOn:t.dependsOn.filter(id=>!completed.has(id))};});
  const estimatePayload=JSON.parse(JSON.stringify({baselineDigest:base.baselineDigest,assessmentDigest:base.assessmentDigest,remainingEstimates,capacities,horizon})),estimateDigest=payloadDigest(estimatePayload);
  if(verifyEstimates({proposal:estimatePayload,digest:estimateDigest,principal,project})!==true)throw Error('Current recovery estimates not verified');
  if(!pending.length)return {...base,status:'NO_REMAINING_WORK',completedTaskIds:[...completed],tasks:[],estimateDigest};
  const result=scheduleProject({principal,project,tasks,capacities,horizon:horizon-assessment.asOf});
  if(result.status!=='SCHEDULE_PROPOSED')return {...base,status:result.status,completedTaskIds:[...completed],tasks:[],estimateDigest};
  const rows=result.tasks.map(row=>{const original=schedule.tasks.find(t=>t.id===row.id);return {...row,start:row.start+assessment.asOf,finish:row.finish+assessment.asOf,originalDependsOn:[...original.dependsOn],requiresApproval:original.requiresApproval===true,requiresProfessionalSignoff:original.requiresProfessionalSignoff===true,...(original.capabilityId===undefined?{}:{capabilityId:original.capabilityId})};});
  return {...base,status:'RECOVERY_SCHEDULE_PROPOSED',estimateDigest,completedTaskIds:[...completed],tasks:rows,makespan:result.makespan+assessment.asOf,baselineMakespan:Math.max(...schedule.tasks.map(t=>t.finish)),remainingPrecedenceLowerBound:result.precedenceLowerBound,method:result.method,timeUnit:result.timeUnit,notice:'Remaining durations are explicitly reviewed estimates, never inferred from progress percentages. Proposal may move future work earlier; adopt only through a separately authorized baseline review.'};
 }});
}
module.exports={createProjectRecoveryPlanner};
