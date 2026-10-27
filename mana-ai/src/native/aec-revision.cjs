'use strict';
/** Deterministic, immutable revision and dependency invalidation for a client-provided AEC brief.
 * NOT a construction compliance check, and NOT geometrically verified takeoff.
 * No IO, generative model, eval, shell, network, or implicit approvals.
 */
const crypto = require('node:crypto');
const {validateBrief,runBrief} = require('./aec-schematic.cjs');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const json = x => JSON.stringify(x);
const clone = x => JSON.parse(json(x));
const safeId = /^[a-z][a-z0-9_]{0,39}$/;
const validVersion = x => Number.isSafeInteger(x) && x >= 1 && x <= 1000000;
const MONEY_SCALE=10000n;

function toUnits(value,label){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1000000)throw Error(`Invalid ${label}`);
 const n=Math.round(value*10000);
 if(!Number.isSafeInteger(n)||Math.abs(value*10000-n)>1e-7)throw Error(`${label} must have at most four decimal places`);
 return BigInt(n);
}
function decimal(units){
 const neg=units<0n;const v=neg?-units:units;
 const whole=v/MONEY_SCALE;const fraction=v%MONEY_SCALE;
 return (neg?'-':'')+whole.toString()+(fraction===0n?'':'.'+fraction.toString().padStart(4,'0').replace(/0+$/,''));
}
function state(brief,version=1){
 validateBrief(brief);if(!validVersion(version))throw Error('Invalid version');
 const snapshot=clone(brief);
 const digest=sha(json(snapshot));
 return {schema:'MANA_AEC_BRIEF_STATE_V1',version,sourceSha256:digest,brief:snapshot};
}
function validateState(s){
 if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).sort().join('|')!=='brief|schema|sourceSha256|version'||s.schema!=='MANA_AEC_BRIEF_STATE_V1'||!validVersion(s.version))throw Error('Invalid versioned state');
 validateBrief(s.brief);
 if(typeof s.sourceSha256!=='string'||s.sourceSha256!==sha(json(s.brief)))throw Error('State digest mismatch');
 return true;
}
function validateChange(c){
 if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).sort().join('|')!=='elementId|field|value')throw Error('Invalid change contract');
 if(typeof c.elementId!=='string'||!safeId.test(c.elementId))throw Error('Invalid elementId');
 if(!['areaM2','label'].includes(c.field))throw Error('Only supported room updates are allowed');
 if(c.field==='areaM2')toUnits(c.value,'areaM2');
 else if(typeof c.value!=='string'||c.value.trim().length<2||c.value.length>80)throw Error('Invalid room label');
 return true;
}
function estimateFor(brief){
 const sum=brief.rooms.reduce((s,r)=>s+toUnits(r.areaM2,'areaM2'),0n);
 return {areaUnits:sum,subTotalUnits:sum*BigInt(brief.unitCost)};
}
function proposeRevision({current,expectedVersion,expectedSha256,changes,actor,reason}){
 validateState(current);
 if(current.version!==expectedVersion||current.sourceSha256!==expectedSha256)throw Error('Stale revision: optimistic concurrency guard failed');
 if(!Array.isArray(changes)||changes.length<1||changes.length>20)throw Error('1-20 changes required');
 if(typeof actor!=='string'||!safeId.test(actor)||typeof reason!=='string'||reason.trim().length<5||reason.length>240)throw Error('Actor and revision reason required');
 const next=clone(current.brief),seen=new Set(),diff=[];
 for(const change of changes){
  validateChange(change);
  const key=change.elementId+':'+change.field;if(seen.has(key))throw Error('Duplicate revision target');seen.add(key);
  const room=next.rooms.find(r=>r.id===change.elementId);
  if(!room)throw Error('Unknown stable element ID');
  if(change.field==='areaM2'&&change.value<3)throw Error('Room area must be at least 3 m2');
  const previous=room[change.field];
  if(previous===change.value)continue;
  diff.push({elementId:change.elementId,field:change.field,before:previous,after:change.value});
  room[change.field]=change.value;
 }
 if(!diff.length)throw Error('No-op revision');
 validateBrief(next); // Refuses envelope overflow and duplicate/invalid rooms.
 // Exact-in-units financial impact; the declared program quantity is NOT a measured geometry quantity.
 const oldAmounts=estimateFor(current.brief),newAmounts=estimateFor(next);
 const areaDelta=newAmounts.areaUnits-oldAmounts.areaUnits;
 const costDelta=newAmounts.subTotalUnits-oldAmounts.subTotalUnits;
 const newState=state(next,current.version+1);
 const hasArea=diff.some(x=>x.field==='areaM2');
 const invalidations=[
  {artifact:'schematic_dxf',invalidate:true,why:'room geometry or label changed'},
  {artifact:'quantity_takeoff',invalidate:hasArea,why:hasArea?'declared area changed':'room quantities unchanged; labels need refresh'},
  {artifact:'cost_estimate',invalidate:hasArea,why:hasArea?'area-dependent estimate changed':'cost amount unchanged'},
  {artifact:'design_booklet',invalidate:true,why:'design version changed'},
  {artifact:'procurement_plan',invalidate:hasArea,why:hasArea?'quantities may affect procurement':'quantity unchanged'},
  {artifact:'schedule',invalidate:hasArea,why:hasArea?'quantity-related schedule assumptions require review':'only room labels changed'},
  {artifact:'contract_claims',invalidate:hasArea,why:hasArea?'potential contractual impact requires human review':'no estimated numeric effect'},
  {artifact:'regulatory_review',invalidate:true,why:'prior sign-off cannot transfer to new design version'},
 ];
 const impact={schema:'MANA_AEC_REVISION_IMPACT_V1',projectId:next.projectId,actor,reason,parentVersion:current.version,parentSha256:current.sourceSha256,nextVersion:newState.version,nextSha256:newState.sourceSha256,changes:diff,quantities:{unit:'m2',basis:'DECLARED_CLIENT_PROGRAM_NOT_MEASURED',before:decimal(oldAmounts.areaUnits),after:decimal(newAmounts.areaUnits),delta:decimal(areaDelta)},cost:{currency:next.currency,basis:'DECLARED_PROGRAM_AREA_X_USER_UNIT_COST',before:decimal(oldAmounts.subTotalUnits),after:decimal(newAmounts.subTotalUnits),delta:decimal(costDelta)},invalidations,requiresProfessionalApproval:true,automaticallyApproved:false,productionDeploymentAllowed:false};
 const output=runBrief(next); // Regenerated preview, not approved architectural drawings.
 if(output.report.netProgramAreaM2 !== Number(decimal(newAmounts.areaUnits)))throw Error('Area precision conflict with schematic producer');
 return {nextState:newState,impact,preview:output};
}
module.exports={state,validateState,proposeRevision};
