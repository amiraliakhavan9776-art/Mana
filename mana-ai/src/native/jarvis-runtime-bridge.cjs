'use strict';
/** Review-only bridge from Jarvis to MANA's ONE durable native mission runtime.
 * No model/provider access and no external side effects. Schematic artifacts only.
 */
const crypto=require('node:crypto');
const {createMissionRuntime}=require('./mission-runtime.cjs');
const {bindAecTools}=require('./scoped-aec-tools.cjs');
const {validate,solve}=require('./aec-layout-solver.cjs');
const {review}=require('./aec-quality-gate.cjs');
const {compilePersonalMission}=require('./jarvis-shared-mission.cjs');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same=(a,b)=>digest(a)===digest(b);
function findDependency(dependencies,id){
 if(!Array.isArray(dependencies)||dependencies.length!==1||dependencies[0].capabilityId!==id||!dependencies[0].result)throw Error('Missing verified dependency '+id);
 return dependencies[0].result;
}
function checkBrief(value){try{validate(value);return true}catch{return false}}
function checkScope(input,scope){return input.projectId===scope.projectId}
function renderReport(q){
 const lines=[`# Jarvis / MANA schematic quality review`,`Project: ${q.projectId}`,`Status: ${q.status}`,`Engineering approved: NO`,`Construction ready: NO`,`Violations: ${q.violations.length}`,...q.violations.map(x=>`- ${x.code}: ${x.details}`),'',`This is a preliminary schematic quality assessment, not a permit or construction drawing.`];
 return {schema:'MANA_JARVIS_SCHEMATIC_REPORT_V1',qualityStatus:q.status,acceptedForSchematicReview:q.status==='SCHEMATIC_CHECKS_PASSED',markdown:lines.join('\n')+'\n',qualityDigest:digest(q)};
}
function makeTools(){
 return [
  {id:'jarvis.aec.layout',title:'MANA schematic AEC layout',requires:[],produces:['jarvis.layout'],workUnits:3,risk:'draft',version:'v1',retrySafe:true,
   validateDependencies:d=>Array.isArray(d)&&d.length===0,
   validate:checkBrief,
   run:({input})=>({layout:solve(input),briefDigest:digest(input)}),
   verify:({input,result})=>result&&result.briefDigest===digest(input)&&same(result.layout,solve(input))},
  {id:'jarvis.aec.quality',title:'MANA independent schematic quality gate',requires:['jarvis.layout'],produces:['jarvis.quality'],workUnits:2,risk:'draft',version:'v1',retrySafe:true,
   validateDependencies:d=>{try{const r=findDependency(d,'jarvis.aec.layout');return !!r.layout&&typeof r.briefDigest==='string'}catch{return false}},
   validate:checkBrief,
   run:({input,dependencies})=>{const upstream=findDependency(dependencies,'jarvis.aec.layout');if(upstream.briefDigest!==digest(input))throw Error('Stale layout brief');return {quality:review({brief:input,layout:upstream.layout}),layoutDigest:digest(upstream.layout)}},
   verify:({input,dependencies,result})=>{try{const upstream=findDependency(dependencies,'jarvis.aec.layout');return upstream.briefDigest===digest(input)&&result.layoutDigest===digest(upstream.layout)&&same(result.quality,review({brief:input,layout:upstream.layout}))}catch{return false}}},
  {id:'jarvis.aec.report',title:'Jarvis evidence-based schematic report',requires:['jarvis.quality'],produces:['jarvis.report'],workUnits:1,risk:'draft',version:'v1',retrySafe:true,
   validateDependencies:d=>{try{return !!findDependency(d,'jarvis.aec.quality').quality}catch{return false}},
   validate:v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===1&&v.format==='markdown',
   run:({dependencies})=>renderReport(findDependency(dependencies,'jarvis.aec.quality').quality),
   verify:({result,dependencies})=>{try{return same(result,renderReport(findDependency(dependencies,'jarvis.aec.quality').quality))}catch{return false}}}
 ];
}
function createJarvisAecBridge({file,key,authorize,timeoutMs=2000}={}){
 const tools=bindAecTools(makeTools()),runtime=createMissionRuntime({file,key,tools,authorize,timeoutMs});
 function start({principal,project,missionId,objective,brief,requestKey}){
  if(!principal||!project||!checkBrief(brief)||!checkScope(brief,{projectId:project.id}))throw Error('Invalid scoped schematic brief');
  // Personal Jarvis planning is derived from the same objective, not a separate executor.
  const person=compilePersonalMission({missionId,ownerId:principal.id,objective,approvedScope:project.id,tools:['aec.layout','aec.quality']});
  const created=runtime.create({principal,project,objective,goals:['jarvis.report'],evidence:[],inputs:{'jarvis.aec.layout':brief,'jarvis.aec.quality':brief,'jarvis.aec.report':{format:'markdown'}},requestKey});
  return {personalPlan:person,created};
 }
 async function advance({principal,project,missionId}){
  const before=runtime.get({principal,project,missionId});
  // At most one verified step per explicit call; never silently loop external effects.
  if(before.status!=='queued')return before;
  return runtime.runNext({principal,project,missionId});
 }
 return Object.freeze({start,advance,get:runtime.get,tools:tools.map(t=>({id:t.id,risk:t.risk})),runtime});
}
module.exports={createJarvisAecBridge,makeTools};
