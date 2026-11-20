'use strict';
// Trusted host contract only. Probes must never be included in a model request.
const {validateExpression,evaluateExpression}=require('./skill-expression.cjs');
const POLICY='MANA_SKILL_DIMENSION_CONTRACT_V1';
const POWERS=Object.freeze({length_m:1,width_m:1,thickness_mm:1,thickness_m:1,excluded_area_m2:2});
const ABS_TOLERANCE=1e-9,REL_TOLERANCE=1e-9;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const keys=(x,names)=>plain(x)&&Object.keys(x).sort().join(',')===[...names].sort().join(',');
const number=x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e12;
function validateDimensionContract(fields,contract){
 try{validateExpression({value:0},fields);}catch{return false;}
 if(!keys(contract,['schema','expectedPower','requiredFields','counterfactualPairs'])||contract.schema!==POLICY||!Number.isInteger(contract.expectedPower)||Math.abs(contract.expectedPower)>4||!Array.isArray(contract.requiredFields)||contract.requiredFields.length>fields.length||new Set(contract.requiredFields).size!==contract.requiredFields.length||contract.requiredFields.some(f=>!fields.includes(f))||!Array.isArray(contract.counterfactualPairs)||contract.counterfactualPairs.length>64)return false;
 const observed=new Set();
 for(const pair of contract.counterfactualPairs){
  if(!keys(pair,['field','before','after'])||!contract.requiredFields.includes(pair.field)||!keys(pair.before,fields)||!keys(pair.after,fields)||fields.some(f=>!number(pair.before[f])||!number(pair.after[f]))||pair.before[pair.field]===pair.after[pair.field]||fields.some(f=>f!==pair.field&&pair.before[f]!==pair.after[f]))return false;
  observed.add(pair.field);
 }
 return contract.requiredFields.every(f=>observed.has(f));
}
function checkSkillDimensions(expression,fields,contract){
 try{validateExpression(expression,fields);}catch{return {ok:false,code:'INVALID_EXPRESSION'};}
 if(!validateDimensionContract(fields,contract))return {ok:false,code:'INVALID_DIMENSION_CONTRACT'};
 if(fields.some(f=>!Object.hasOwn(POWERS,f)))return {ok:false,code:'UNKNOWN_FIELD_DIMENSION'};
 const fail=code=>{throw Object.assign(Error(code),{dimensionCode:code});};
 const numeric=t=>{if(t.kind!=='number')fail('DIMENSION_TYPE_MISMATCH');return t;};
 const unify=(a,b)=>{
  if(a.kind!==b.kind)fail('DIMENSION_TYPE_MISMATCH');if(a.kind==='boolean')return {kind:'boolean'};
  // Literal zero may have the unit of its peer (e.g. max(0, area)).
  // This does not confer units on nonzero constants or computed values.
  if(a.power===b.power)return {kind:'number',power:a.power,zero:a.zero&&b.zero};
  if(a.zero)return {kind:'number',power:b.power};if(b.zero)return {kind:'number',power:a.power};
  fail('DIMENSION_MISMATCH');
 };
 function walk(x){
  if(Object.hasOwn(x,'value'))return typeof x.value==='boolean'?{kind:'boolean'}:{kind:'number',power:0,zero:x.value===0};
  if(Object.hasOwn(x,'field'))return {kind:'number',power:POWERS[x.field]};
  const args=x.args.map(walk);
  if(x.op==='if'){if(args[0].kind!=='boolean')fail('DIMENSION_TYPE_MISMATCH');return unify(args[1],args[2]);}
  if(x.op==='equal'){unify(args[0],args[1]);return {kind:'boolean'};}
  const a=numeric(args[0]),b=numeric(args[1]);
  if(x.op==='multiply'||x.op==='divide'){const power=a.power+(x.op==='multiply'?b.power:-b.power);if(Math.abs(power)>8)fail('DIMENSION_POWER_LIMIT');return {kind:'number',power};}
  const merged=unify(a,b);return x.op==='less'?{kind:'boolean'}:merged;
 }
 let output;try{output=walk(expression);}catch(error){return {ok:false,code:error.dimensionCode||'DIMENSION_TYPE_MISMATCH'};}
 if(output.kind!=='number')return {ok:false,code:'DIMENSION_TYPE_MISMATCH'};
 if(output.power!==contract.expectedPower)return {ok:false,code:'OUTPUT_DIMENSION_MISMATCH',actualPower:output.power};
 const effective=new Set();
 for(const pair of contract.counterfactualPairs){
  let before,after;try{before=evaluateExpression(expression,pair.before,fields);after=evaluateExpression(expression,pair.after,fields);}catch{return {ok:false,code:'DEPENDENCE_EVALUATION_FAILED',actualPower:output.power};}
  if(!number(before)||!number(after))return {ok:false,code:'DEPENDENCE_EVALUATION_FAILED',actualPower:output.power};
  if(Math.abs(after-before)>ABS_TOLERANCE+REL_TOLERANCE*Math.max(Math.abs(before),Math.abs(after)))effective.add(pair.field);
 }
 const missingFields=contract.requiredFields.filter(f=>!effective.has(f));
 if(missingFields.length)return {ok:false,code:'REQUIRED_FIELD_NOT_EFFECTIVE',actualPower:output.power,missingFields};
 return {ok:true,code:'DIMENSIONS_AND_DEPENDENCE_VERIFIED',actualPower:output.power,missingFields:[],scope:'Length powers and observed supplied counterfactuals only; not unit conversion or universal dependence proof',absoluteTolerance:ABS_TOLERANCE,relativeTolerance:REL_TOLERANCE};
}
module.exports={POLICY,checkSkillDimensions,validateDimensionContract};
