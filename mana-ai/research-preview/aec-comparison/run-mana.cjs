'use strict';
const {calculateGrossPlanar,createNasaQuantityReporter}=require('../nasa-quantity-report.cjs');
const {SOURCE,SCHEMA,CASES}=require('./cases.cjs');
function runMana({mode,workspace,pythonPath}={}){
 let calculate;
 if(mode==='fixture'&&workspace===undefined&&pythonPath===undefined)calculate=calculateGrossPlanar;
 else if(mode==='verified-receipt'&&typeof workspace==='string'&&typeof pythonPath==='string'){
  const reporter=createNasaQuantityReporter({workspace,pythonPath});
  calculate=input=>reporter.report(input).report;
 }else throw Error('SOURCE_MODE_REQUIRED');
 const results=CASES.map(c=>{
  const reason=c.request!=='gross'?'OUT_OF_SCOPE':c.dimensions.includes(null)?'PERPENDICULAR_HEIGHT_REQUIRED':
   new Set(c.units).size!==1?'MIXED_UNITS':c.units[0]!=='mm'?'WHOLE_MILLIMETERS_REQUIRED':null;
  if(reason)return {id:c.id,status:'ABSTAIN',shape:c.shape,inputUnit:null,dimensionsMm:null,formulaId:null,
   twiceAreaMm2:null,denominator:null,areaMm2:null,areaM2:null,sourceUrl:null,reasonCode:reason};
  const [a,b,h]=c.dimensions;
  const fields=c.shape==='rectangle'?{base_mm:a,perpendicular_height_mm:b}:
   {parallel_base_a_mm:a,parallel_base_b_mm:b,perpendicular_height_mm:h};
  const r=calculate({shape:c.shape,unit:'mm',...fields});
  if(mode==='verified-receipt'&&r.provenance?.lessonUrl!==SOURCE)throw Error('SOURCE_URL_MISMATCH');
  return {id:c.id,status:'OK',shape:c.shape,inputUnit:'mm',dimensionsMm:[...c.dimensions],
   formulaId:r.formula.id,twiceAreaMm2:r.quantity.twiceAreaMm2,denominator:r.quantity.denominator,
   areaMm2:r.quantity.mm2,areaM2:r.quantity.m2,sourceUrl:r.provenance?.lessonUrl??SOURCE,reasonCode:null};
 });
 return {schema:SCHEMA,results};
}
if(require.main===module){
 try{
  const [mode,workspace,pythonPath,...extra]=process.argv.slice(2);
  if(extra.length)throw Error('SOURCE_MODE_REQUIRED');
  const r=runMana({mode,workspace,pythonPath});
  console.error(mode==='fixture'?'LOCAL_FIXTURE_ARITHMETIC_ONLY; source URL is provided by exercise; no receipt revalidated':
   'ORIGINAL_VERIFIED_NASA_RECEIPT_READ_ONLY; no fresh web call');
  console.log(JSON.stringify(r,null,2));
 }catch(e){console.error(e.code||e.message);process.exitCode=2;}
}
module.exports={runMana};
