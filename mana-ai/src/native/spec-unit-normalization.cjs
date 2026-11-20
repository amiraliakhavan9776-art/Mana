'use strict';
// Host-owned conversion: no input values, test answers or formula go to the prover.
const UNIT_POLICY='spec-layer-volume-input-metres-v1';
const ID='spec-v11-layer-volume-m3';
const rawFields=['length_m','width_m','thickness_mm'];
const normalizedFields=['length_m','width_m','thickness_m'];
const instruction='Synthetic nonfinancial geometry only. Return the volume in cubic metres of a uniform rectangular layer. length_m, width_m and thickness_m are already in metres. No unit conversion or rounding is needed. No real project decisions, side effects or imports. Output one bounded DSL expression, not prose.';
const plain=x=>x!==null&&typeof x==='object'&&Object.getPrototypeOf(x)===Object.prototype;
const inRange=(x,limit)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=limit;
function toMetreInputs(input){
 if(!plain(input)||Object.keys(input).length!==3||!rawFields.every(k=>Object.hasOwn(input,k)))throw Error('Exact raw volume input fields required');
 const {length_m,width_m,thickness_mm}=input;
 if(!inRange(length_m,100)||!inRange(width_m,100)||!inRange(thickness_mm,1000))throw Error('Raw volume inputs are outside the reviewed range');
 const thickness_m=thickness_mm/1000;
 if(thickness_mm>0&&thickness_m===0)throw Error('Volume thickness conversion underflow');
 return {length_m,width_m,thickness_m};
}
function normalizeVolumeCatalog(catalog){
 const raw=catalog.missions.find(m=>m.id===ID);
 if(!raw||raw.section!=='6.6'||raw.task.id!==ID||!Array.isArray(raw.task.fields)||JSON.stringify([...raw.task.fields].sort())!==JSON.stringify([...rawFields].sort())||raw.dimensionContract?.expectedPower!==3||JSON.stringify(raw.dimensionContract.requiredFields)!==JSON.stringify(rawFields))throw Error('Unreviewed volume unit mapping');
 const lowered={...raw,task:{...raw.task,instruction,fields:[...normalizedFields],tests:raw.task.tests.map(({input,expected})=>({input:toMetreInputs(input),expected}))},dimensionContract:{...raw.dimensionContract,requiredFields:[...normalizedFields],counterfactualPairs:raw.dimensionContract.counterfactualPairs.map(({field,before,after})=>({field:field==='thickness_mm'?'thickness_m':field,before:toMetreInputs(before),after:toMetreInputs(after)}))}};
 return {...catalog,missions:catalog.missions.map(m=>m===raw?lowered:m)};
}
module.exports={UNIT_POLICY,toMetreInputs,normalizeVolumeCatalog};
