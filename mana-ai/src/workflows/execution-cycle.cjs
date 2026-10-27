'use strict';
const {createNativeCore}=require('../native/core.cjs');
// Deterministic criteria gate; not an independent specialist/LLM council.
function reviewMissionSnapshot(m){
 const project={id:m.projectId,orgId:m.orgId},principal={id:m.requesterId,orgId:m.orgId,role:'analyst',projectIds:[m.projectId]};
 const scores={technical:m.tasks.every(t=>t.dependsOn.every(id=>m.tasks.some(x=>x.taskId===id)))?1:0,risk:m.tasks.every(t=>['read','draft'].includes(t.risk))?1:0,budget:m.plan.totalWorkUnits<=(m.workBudget??1000000)?1:0};
 const evidence=Object.entries(scores).map(([id,value])=>({id,orgId:m.orgId,projectId:m.projectId,key:'execute:'+id,value,source:'scoped-runtime-snapshot:'+m.id+':'+m.version,verification:'verified'}));
 return createNativeCore().evaluate({principal,project,evidence,criteria:Object.keys(scores).map(id=>({id,weight:1,direction:'maximize',min:0,max:1,requiredMin:1})),alternatives:[{id:'execute',label:'Execute bounded plan',assessments:Object.entries(scores).map(([criterionId,value])=>({criterionId,value,evidenceIds:[criterionId]}))}]});
}
async function runExecutionCycle({service,context,autoReplan=false,replanInputs={},maxSteps=12,onProgress=()=>{},memory=null}){
 if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>32)throw Error('Invalid cycle bound');
 // Recalled user statements are context, never permissions or verified evidence.
 const memories=memory?.recall===true?service.memory.recall({subject:context.subject,query:memory.query??''}):[];
 let mission=service.get(context),review=reviewMissionSnapshot(mission);
 function finish(stopped,extra={}){
  let saved=null;
  if(mission.status==='completed'&&memory?.consent===true)saved=service.memory.remember({subject:context.subject,kind:'decision',text:'Mission '+mission.id+' completed; runtime version '+mission.version+'. Deterministic criteria review: '+review.status,retentionMs:memory.retentionMs,consent:true});
  return {mission,review,stopped,memoryRecordsConsulted:memories.length,memoryRecord:saved?.id??null,...extra};
 }
 if(review.status!=='DECISION_PROPOSED')return finish('review_veto');
 for(let i=0;i<maxSteps;i++){
  if(mission.status==='failed'&&autoReplan){
   const changed=service.replan({...context,expectedVersion:mission.version,inputs:replanInputs});
   if(!changed.replanned)return finish('no_safe_replan',{analysis:changed.analysis});
   mission=changed.mission;review=reviewMissionSnapshot(mission);
   if(review.status!=='DECISION_PROPOSED')return finish('review_veto');
  }
  if(mission.status!=='queued')return finish(mission.status);
  mission=await service.runNext(context);await onProgress({missionId:mission.id,version:mission.version,status:mission.status});
 }
 return finish('cycle_limit');
}
module.exports={reviewMissionSnapshot,runExecutionCycle};
