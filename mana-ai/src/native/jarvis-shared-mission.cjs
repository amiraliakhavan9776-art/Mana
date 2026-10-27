'use strict';
/** Jarvis contract/quality planner. Delegates to MANA's existing mission runtime. */
const crypto=require('node:crypto');
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ID=/^[a-z][a-z0-9_-]{0,63}$/;
const TASKS={
 'aec.layout':{needs:[],artifact:'schematic_layout'},
 'aec.quality':{needs:['aec.layout'],artifact:'quality_review'},
 'aec.dxf':{needs:['aec.quality'],artifact:'editable_dxf'},
 'aec.takeoff':{needs:['aec.quality'],artifact:'quantity_takeoff'},
 'finance.audit':{needs:[],artifact:'financial_audit'},
 'documents.report':{needs:[],artifact:'document_report'},
 'code.draft':{needs:[],artifact:'code_draft'},
 'code.sandbox':{needs:['code.draft'],artifact:'sandbox_evidence'},
 'code.review':{needs:['code.sandbox'],artifact:'review_bundle'},
};
function compilePersonalMission(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['missionId','ownerId','objective','tools','approvedScope','requiresApproval'].includes(k)))throw Error('Invalid Jarvis mission');
 const {missionId,ownerId,objective,tools,approvedScope}=input;
 if(!ID.test(missionId??'')||!ID.test(ownerId??'')||typeof objective!=='string'||objective.length<12||objective.length>1000||!Array.isArray(tools)||tools.length<1||tools.length>9||!ID.test(approvedScope??''))throw Error('Invalid mission requirements');
 if(input.requiresApproval!==undefined&&typeof input.requiresApproval!=='boolean')throw Error('Invalid approval flag');
 if(new Set(tools).size!==tools.length||tools.some(k=>!Object.hasOwn(TASKS,k)))throw Error('Unknown/duplicate capability');
 // Add prerequisites deterministically; no external tools are invoked by compiling a plan.
 const active=new Set();const visit=t=>{for(const n of TASKS[t].needs)visit(n);active.add(t)};for(const t of tools)visit(t);
 const ordered=[...active];const steps=ordered.map((capabilityId,index)=>({taskId:'step_'+(index+1),capabilityId,dependsOn:TASKS[capabilityId].needs.filter(t=>active.has(t)).map(t=>'step_'+(ordered.indexOf(t)+1)),expectedArtifact:TASKS[capabilityId].artifact,status:'NOT_STARTED'}));
 const review=steps.some(x=>['aec.dxf','code.review','finance.audit'].includes(x.capabilityId));
 return {schema:'MANA_JARVIS_PERSONAL_MISSION_PLAN_V1',missionId,ownerId,approvedScope,objective,steps,requiresHumanApproval:review||input.requiresApproval===true,ownerDataIsolationRequired:true,proposalOnly:true,completed:false,executedTools:0,digest:sha({missionId,ownerId,approvedScope,objective,steps})};
}
function validateResultClaim(plan,results){
 if(!plan||plan.schema!=='MANA_JARVIS_PERSONAL_MISSION_PLAN_V1'||!Array.isArray(results))throw Error('Invalid review inputs');
 const seen=new Set(),violations=[];
 for(const r of results){
  if(!r||typeof r.taskId!=='string'||seen.has(r.taskId)||!plan.steps.some(t=>t.taskId===r.taskId))throw Error('Invalid result reference');seen.add(r.taskId);
  if(!['succeeded','failed','unknown'].includes(r.status)||typeof r.verified!=='boolean'||(r.status==='succeeded'&&r.verified!==true))violations.push(r.taskId+':unverified');
 }
 for(const t of plan.steps)if(!seen.has(t.taskId))violations.push(t.taskId+':missing');
 return {schema:'MANA_JARVIS_MISSION_REVIEW_V1',status:violations.length?'REVIEW_REQUIRED':'EVIDENCE_SUPPLIED_PENDING_AUDIT',violations,autonomouslyApproved:false,productionDeploymentAllowed:false};
}
module.exports={compilePersonalMission,validateResultClaim,TASKS};
