'use strict';
/** Independent, fail-closed schematic quality review. NOT building code compliance. */
const crypto = require('node:crypto');
const {plan} = require('./aec-access-plan.cjs');
const {solve} = require('./aec-layout-solver.cjs');
const {validate:validateBrief}=require('./aec-layout-solver.cjs');
const sha = x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function review({brief, layout, accessOptions={}}){
 if(!brief||typeof brief!=='object'||!layout||typeof layout!=='object')throw Error('Structured brief and layout required');
 validateBrief(brief);
 if(brief.projectId!==layout.projectId)throw Error('Project mismatch');
 if(!Array.isArray(brief.rooms)||!Array.isArray(layout.rooms)||layout.rooms.length>10||layout.schema!=='MANA_AEC_LAYOUT_V1')throw Error('Invalid room inputs');
 const violations=[];
 const add=(code,details)=>violations.push({code,details});
 if(layout.status!=='FEASIBLE_SCHEMATIC_LAYOUT')add('LAYOUT_NOT_FEASIBLE','No proven arrangement');
 const requested=new Map(brief.rooms.map(r=>[r.id,r]));
 const actual=new Map();
 for(const room of layout.rooms){
  if(actual.has(room.id))add('DUPLICATE_ROOM',room.id);
  actual.set(room.id,room);
  if(!requested.has(room.id))add('UNEXPECTED_ROOM',room.id);
  if(![room.xM,room.yM,room.widthM,room.depthM].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0))add('INVALID_GEOMETRY',room.id);
 }
 for(const [id,r] of requested){
  if(!actual.has(id)){add('MISSING_ROOM',id);continue;}
  const a=actual.get(id);
  if(Number.isFinite(a.widthM)&&Number.isFinite(a.depthM)&&Number.isFinite(r.widthM)&&Number.isFinite(r.depthM)){
   if(Math.abs(a.widthM*a.depthM-r.widthM*r.depthM)>0.001)add('ROOM_AREA_MISMATCH',id);
   const matches=(w,h)=>Math.abs(a.widthM-w)<=1e-6&&Math.abs(a.depthM-h)<=1e-6;
   if(!matches(r.widthM,r.depthM)&&!matches(r.depthM,r.widthM))add('ROOM_DIMENSIONS_MISMATCH',id);
  }
 }
 if(brief.rooms.length!==layout.rooms.length)add('ROOM_COUNT_MISMATCH','Different room counts');
 // Do not silently mark bad geometry as acceptable even if a forged status says feasible.
 for(let i=0;i<layout.rooms.length;i++)for(let j=i+1;j<layout.rooms.length;j++){
  const a=layout.rooms[i],b=layout.rooms[j];
  if([a.xM,a.yM,a.widthM,a.depthM,b.xM,b.yM,b.widthM,b.depthM].every(Number.isFinite)
   &&a.xM<b.xM+b.widthM-1e-8&&b.xM<a.xM+a.widthM-1e-8
   &&a.yM<b.yM+b.depthM-1e-8&&b.yM<a.yM+a.depthM-1e-8)add('ROOMS_OVERLAP',`${a.id}|${b.id}`);
 }
 const dimensions=[brief.widthM,brief.depthM];
 if(dimensions.every(x=>Number.isFinite(x)&&x>0))for(const r of layout.rooms){
  if(Number.isFinite(r.xM)&&Number.isFinite(r.yM)&&Number.isFinite(r.widthM)&&Number.isFinite(r.depthM)
   &&(r.xM<0||r.yM<0||r.xM+r.widthM>brief.widthM+1e-8||r.yM+r.depthM>brief.depthM+1e-8))add('OUTSIDE_ENVELOPE',r.id);
 }
 let access=null;
 const pairs=value=>{if(!Array.isArray(value))return null;const result=[];for(const pair of value){if(!Array.isArray(pair)||pair.length!==2||pair.some(id=>!requested.has(id))||pair[0]===pair[1])return null;result.push([...pair].sort().join('|'));}return [...new Set(result)].sort();};
 const declared=pairs(layout.requiredAdjacencies??[]),required=pairs(brief.adjacencies);
 if(declared===null||JSON.stringify(declared)!==JSON.stringify(required))add('ADJACENCY_DECLARATION_MISMATCH','Layout adjacency claims differ from the original brief');
 if(violations.length===0){
  try{access=plan({...layout,requiredAdjacencies:brief.adjacencies},accessOptions);
   if(access.status!=='SCHEMATIC_ACCESS_CONNECTED'){
    if(access.inaccessibleRooms.length)add('INACCESSIBLE_ROOMS',access.inaccessibleRooms.join(','));
    if(access.missingRequiredDoorConnections.length)add('MISSING_DOOR',JSON.stringify(access.missingRequiredDoorConnections));
    if(access.missingRequiredWindows.length)add('MISSING_WINDOW',access.missingRequiredWindows.join(','));
   }
  }catch(e){add('ACCESS_EVALUATION_FAILED',String(e.message).slice(0,180));}
 }
 return {schema:'MANA_AEC_QUALITY_GATE_V1',projectId:brief.projectId,status:violations.length?'REVIEW_REQUIRED':'SCHEMATIC_CHECKS_PASSED',checks:['room-identity','dimensions','geometric-overlap','envelope','door-connectivity','requested-window'],violations,sourceDigest:sha({brief,layout,accessOptions}),access,engineeringApproved:false,permitApproved:false,constructionReady:false,limitations:['No regulatory or structural compliance verified','No fire egress, accessibility, daylight or ventilation calculations','The result is a schematic geometry assessment only']};
}
function proposeRepair({brief,layout,accessOptions={},attempt=1,maxAttempts=2}){
 if(!Number.isInteger(attempt)||attempt<1||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>4)throw Error('Invalid bounded repair budget');
 const before=review({brief,layout,accessOptions});
 if(before.status==='SCHEMATIC_CHECKS_PASSED')return {status:'ALREADY_PASSED',attempt,before,after:before,proposal:null,approved:false};
 if(attempt>maxAttempts)return {status:'REPAIR_BUDGET_EXHAUSTED',attempt,before,after:null,proposal:null,approved:false};
 // Deterministic constrained replanning is a *proposal*, never silent overwriting.
 let candidate;
 try{candidate=solve(brief);}catch(e){return {status:'CANNOT_REPAIR',attempt,before,after:null,proposal:null,reason:String(e.message).slice(0,180),approved:false};}
 if(candidate.status!=='FEASIBLE_SCHEMATIC_LAYOUT')return {status:'CANNOT_REPAIR',attempt,before,after:null,proposal:null,reason:'Solver cannot find a feasible layout',approved:false};
 const after=review({brief,layout:candidate,accessOptions});
 return {status:after.status==='SCHEMATIC_CHECKS_PASSED'?'REPAIR_PROPOSED_AWAITING_REVIEW':'REPAIR_UNRESOLVED',attempt,before,after,proposal:candidate,approved:false};
}
module.exports={review,proposeRepair};
