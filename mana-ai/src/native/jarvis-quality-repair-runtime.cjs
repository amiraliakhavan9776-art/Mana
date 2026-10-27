'use strict';
/** Bounded, evidence-verifiable repair workflow in the canonical MANA Mission Runtime.
 * Inputs: a scoped brief and an existing untrusted draft layout.
 * Outputs: independent review, constrained alternative and explicit limitations.
 * Nothing writes to production, invokes a generative model or certifies construction.
 */
const crypto=require('node:crypto');
const {createMissionRuntime}=require('./mission-runtime.cjs');
const {bindAecTools}=require('./scoped-aec-tools.cjs');
const {validate}=require('./aec-layout-solver.cjs');
const {review,proposeRepair}=require('./aec-quality-gate.cjs');
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const equal=(a,b)=>digest(a)===digest(b);
const ID=/^[A-Za-z0-9_-]{1,100}$/;
const ids=['jarvis.repair.input','jarvis.repair.review','jarvis.repair.propose','jarvis.repair.report'];
function inputOk(x){
 try{
  if(!x||typeof x!=='object'||Array.isArray(x)||!x.brief||!x.layout)return false;
  validate(x.brief);
  return x.layout.schema==='MANA_AEC_LAYOUT_V1'&&x.layout.projectId===x.brief.projectId&&Array.isArray(x.layout.rooms)&&x.layout.rooms.length<=32&&JSON.stringify(x).length<=30000;
 }catch{return false}
}
function dep(ds,id){if(!Array.isArray(ds)||ds.length!==1||ds[0].capabilityId!==id||!ds[0].result)throw Error('Missing required dependency');return ds[0].result}
function report(reviewResult,repairResult){
 const effective=repairResult.after?.status==='SCHEMATIC_CHECKS_PASSED'&&repairResult.proposal?repairResult.after:reviewResult.quality;
 const status=effective.status==='SCHEMATIC_CHECKS_PASSED'?'SCHEMATIC_REVIEW_PASSED':'REVIEW_REQUIRED';
 const lines=['# MANA / Jarvis independent quality and repair report',`Project: ${reviewResult.projectId}`,`Initial assessment: ${reviewResult.quality.status}`,`Repair: ${repairResult.status}`,`Final assessment: ${status}`,'Engineering approved: NO','Construction ready: NO',`Initial violations: ${reviewResult.quality.violations.length}`,...reviewResult.quality.violations.map(v=>`- ${v.code}`),'', 'A geometrically checked schematic is NOT a construction drawing.'];
 return {schema:'MANA_JARVIS_REPAIR_REPORT_V1',projectId:reviewResult.projectId,status,initialDigest:digest(reviewResult),repairDigest:digest(repairResult),candidateDigest:repairResult.proposal?digest(repairResult.proposal):null,repairStatus:repairResult.status,proposedLayout:repairResult.proposal??null,engineeringApproved:false,constructionReady:false,markdown:lines.join('\n')+'\n'};
}
function tools(){return [
 {id:ids[0],title:'Scoped untrusted draft snapshot',requires:[],produces:['jarvis.repair.input'],workUnits:1,risk:'draft',version:'v1',retrySafe:true,validateDependencies:d=>Array.isArray(d)&&d.length===0,validate:inputOk,
  run:({input})=>({projectId:input.brief.projectId,brief:input.brief,layout:input.layout,sourceDigest:digest(input)}),verify:({input,result})=>inputOk(input)&&equal(result,{projectId:input.brief.projectId,brief:input.brief,layout:input.layout,sourceDigest:digest(input)})},
 {id:ids[1],title:'Independent quality review',requires:[ids[0]],produces:['jarvis.repair.review'],workUnits:2,risk:'draft',version:'v1',retrySafe:true,validateDependencies:d=>{try{return inputOk(dep(d,ids[0]))}catch{return false}},validate:x=>x&&x.action==='review',
  run:({dependencies})=>{const d=dep(dependencies,ids[0]);return {projectId:d.projectId,sourceDigest:d.sourceDigest,quality:review({brief:d.brief,layout:d.layout})}},verify:({dependencies,result})=>{try{const d=dep(dependencies,ids[0]);return equal(result,{projectId:d.projectId,sourceDigest:d.sourceDigest,quality:review({brief:d.brief,layout:d.layout})})}catch{return false}}},
 {id:ids[2],title:'Bounded deterministic repair proposal',requires:[ids[1],ids[0]],produces:['jarvis.repair.propose'],workUnits:4,risk:'draft',version:'v1',retrySafe:true,validateDependencies:d=>Array.isArray(d)&&d.length===2&&d.some(x=>x.capabilityId===ids[0])&&d.some(x=>x.capabilityId===ids[1]),validate:x=>x&&x.maxAttempts===2,
  run:({dependencies})=>{const d=dependencies.find(x=>x.capabilityId===ids[0]).result,q=dependencies.find(x=>x.capabilityId===ids[1]).result;if(q.sourceDigest!==d.sourceDigest)throw Error('Stale original draft');const r=proposeRepair({brief:d.brief,layout:d.layout,attempt:1,maxAttempts:2});return {projectId:d.projectId,qualityDigest:digest(q),repair:r}},
  verify:({dependencies,result})=>{try{const d=dependencies.find(x=>x.capabilityId===ids[0]).result,q=dependencies.find(x=>x.capabilityId===ids[1]).result;return q.sourceDigest===d.sourceDigest&&equal(result,{projectId:d.projectId,qualityDigest:digest(q),repair:proposeRepair({brief:d.brief,layout:d.layout,attempt:1,maxAttempts:2})})}catch{return false}}},
 {id:ids[3],title:'Evidence-based repair summary',requires:[ids[2],ids[1]],produces:['jarvis.repair.report'],workUnits:1,risk:'draft',version:'v1',retrySafe:true,validateDependencies:d=>Array.isArray(d)&&d.length===2&&d.some(x=>x.capabilityId===ids[1])&&d.some(x=>x.capabilityId===ids[2]),validate:x=>x&&x.format==='markdown',
  run:({dependencies})=>{const q=dependencies.find(x=>x.capabilityId===ids[1]).result,r=dependencies.find(x=>x.capabilityId===ids[2]).result;return report(q,r.repair)},
  verify:({dependencies,result})=>{try{const q=dependencies.find(x=>x.capabilityId===ids[1]).result,r=dependencies.find(x=>x.capabilityId===ids[2]).result;return equal(result,report(q,r.repair))}catch{return false}}}
 ];}
function createJarvisRepairBridge({file,key,authorize,timeoutMs=4000}={}){
 const registry=bindAecTools(tools()),runtime=createMissionRuntime({file,key,authorize,timeoutMs,tools:registry});
 function start({principal,project,objective,brief,layout,requestKey}){
  const candidate={brief,layout};
  if(!inputOk(candidate)||brief.projectId!==project?.id||!ID.test(requestKey??''))throw Error('Invalid scoped repair mission');
  return runtime.create({principal,project,objective,goals:['jarvis.repair.report'],evidence:[],inputs:{[ids[0]]:candidate,[ids[1]]:{action:'review'},[ids[2]]:{maxAttempts:2},[ids[3]]:{format:'markdown'}},requestKey});
 }
 return Object.freeze({start,runNext:runtime.runNext,get:runtime.get,tools:registry.map(x=>({id:x.id,risk:x.risk})),runtime});
}
module.exports={createJarvisRepairBridge,makeRepairTools:tools};
