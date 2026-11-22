'use strict';
// Development-only probe: no state or learner reads/writes, no raw evidence output.
const path=require('node:path');
const {createHash}=require('node:crypto');
const {INDEX_URL,AREA_URL,fetchNasa,discoverNasaArea,inspectNasaMarkup}=require('./nasa-area-source.cjs');

const SCHEMA='MANA_NASA_LAYOUT_DIAGNOSTIC_V1';
const OPEN='On the slide we have listed the formula to calculate the area of a variety of shapes:';
const CLAUSE='The equation for the area of a trapezoid';
const FAULTS=new Set([
 'NASA_HTTPS_TIMEOUT','NASA_HTTPS_REQUEST_FAILED','NASA_HTTPS_STATUS_REJECTED','NASA_HTTPS_MEDIA_REJECTED',
 'NASA_HTTPS_BODY_REJECTED','NASA_HTTPS_INCOMPLETE','NASA_AREA_LINK_NOT_APPROVED','NASA_AREA_LINK_MISSING_OR_AMBIGUOUS',
 'NASA_LINK_MALFORMED','NASA_PLANAR_EVIDENCE_SHAPE_INVALID','NASA_PLANAR_PRECEDING_EVIDENCE_MISSING',
 'NASA_PLANAR_PARAGRAPH_PREFIX_MISSING','NASA_PLANAR_FORBIDDEN_SCOPE','NASA_FORMULA_ROLE_OR_PROSE_MISMATCH',
 'NASA_TRAPEZOID_CLAUSE_NOT_SUPPORTED','NASA_TRAPEZOID_CLAUSE_MISSING_OR_AMBIGUOUS','NASA_WRONG_LESSON',
 'NASA_MARKUP_INVALID','NASA_INLINE_STYLESHEET_UNSUPPORTED','NASA_EXTRACTOR_START_OR_OUTPUT_FAILED','NASA_EXTRACTOR_TIMEOUT',
]);
const abs=p=>typeof p==='string'&&p.length<4096&&!p.includes('\0')&&path.isAbsolute(p)&&path.resolve(p)===p;
const safeFault=e=>FAULTS.has(e?.message)?e.message:'NASA_DIAGNOSTIC_UNVERIFIED';
const tokenize=s=>s.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
const phrase=tokenize(OPEN),clause=tokenize(CLAUSE);
const withWord=word=>phrase.map(t=>t==='formula'?word:t);
const plurals=[withWord('formulas'),withWord('formulae')];
const fragments=[
 ['onSlide',[['on','the','slide']]],['listed',[['we','have','listed']]],
 ['formula',[['the','formula'],['the','formulas'],['the','formulae']]],
 ['calculate',[['to','calculate']]],['areaOf',[['the','area','of']]],['variety',[['a','variety','of','shapes']]],
];
const matches=(hay,needle,i)=>needle.every((token,k)=>hay[i+k]===token);
function positions(tokens,variants){
 const found=[];
 for(let i=0;i<tokens.length;i++)for(const v of variants)if(matches(tokens,v,i)){found.push(i);break;}
 return found;
}
function first(tokens,variants){return positions(tokens,variants)[0]??null;}
function closest(tokens,variants,ref){
 let nearest=null;
 if(ref===null)return nearest;
 for(const p of positions(tokens,variants)){
  const distance=p-ref;
  if(nearest===null||Math.abs(distance)<Math.abs(nearest))nearest=distance;
 }
 return nearest;
}
function summarize(row,role){
 const text=row.text,tokens=tokenize(text);
 const normFirst=first(tokens,[phrase]),pluralFirst=first(tokens,plurals);
 const fragmentPositions=fragments.map(([name,variants])=>[name,positions(tokens,variants),variants[0].length]);
 const adjacent={};
 for(let i=0;i<fragmentPositions.length-1;i++){
  const [name,left,n]=fragmentPositions[i],[next,right]=fragmentPositions[i+1],ends=new Set(right);
  adjacent[name+'To'+next[0].toUpperCase()+next.slice(1)]=left.some(x=>ends.has(x+n));
 }
 const ref=first(tokens,[clause])??first(tokens,[['we','have','listed']]);
 const cues={};
 for(const [key,variants] of [
  ['formulaSingular',[['formula']]],['formulaPlural',[['formulas'],['formulae']]],
  ['title',[['title'],['heading']]],['caption',[['caption'],['figure'],['slide']]],
 ])cues[key]={firstToken:first(tokens,variants),closestDistanceFromReference:closest(tokens,variants,ref)};
 return {
  role,tokenCount:tokens.length,referenceToken:ref,
  exactOpeningStarts:text.startsWith(OPEN),exactOpeningIncludes:text.includes(OPEN),
  normalizedOpeningStarts:normFirst===0,normalizedOpeningIncludes:normFirst!==null,
  normalizedOpeningFirstToken:normFirst,normalizedPluralOpeningFirstToken:pluralFirst,
  fragmentFirstTokens:Object.fromEntries(fragmentPositions.map(([name,places])=>[name,places[0]??null])),
  adjacent,cues,
 };
}
async function diagnoseNasaLayout({pythonPath,request}={}){
 const base={schema:SCHEMA,transport:'DIRECT_OFFICIAL_HTTPS',qualification:'Fixed-template structural diagnostics only; no authority or candidate validation.'};
 const blocked=(stage,fault)=>({...base,status:'DIAGNOSTIC_BLOCKED',stage,fault,paragraphs:[]});
 if(!abs(pythonPath))return blocked('setup','NASA_PYTHON_PATH_REQUIRED');
 let selectedBytes=null,requestCount=0,rejection=null;
 try{
  // The existing discovery path chooses the link. Captures stay in memory.
  await discoverNasaArea({mode:'direct',pythonPath,reader:async choice=>{
   const expect=requestCount===0?INDEX_URL:requestCount===1?AREA_URL:null;
   if(choice.url!==expect)throw Error('NASA_AREA_LINK_NOT_APPROVED');
   requestCount++;
   const record=await fetchNasa(choice.url,request);
   if(choice.kind==='selected-link')selectedBytes=record.bytes;
   return record;
  }});
 }catch(e){
  rejection=safeFault(e);
  if(!selectedBytes)return blocked(e?.sourceStage==='index'||e?.sourceStage==='selected-link'?e.sourceStage:'setup',rejection);
 }
 if(!selectedBytes)return blocked('selected-link','NASA_DIAGNOSTIC_UNVERIFIED');
 let parsed;
 try{parsed=inspectNasaMarkup(pythonPath,'lesson',selectedBytes);}
 catch(e){return blocked('selected-link',safeFault(e));}
 const prior=parsed?.earlier,clauseRow=parsed?.clause;
 if(!Array.isArray(prior)||prior.length>4||![clauseRow,...prior].every(r=>typeof r?.text==='string'&&r.text.length<=16000))
  return blocked('selected-link','NASA_PLANAR_EVIDENCE_SHAPE_INVALID');
 return {...base,status:'LAYOUT_SUMMARY',stage:'selected-link',fault:rejection,
  lessonTitleVerified:true,lessonSha256:createHash('sha256').update(selectedBytes).digest('hex'),priorCleanParagraphCount:prior.length,
  referenceConvention:'First trapezoid-clause token; else first listed-fragment token. Signed distances and offsets use normalized tokens.',
  paragraphs:[summarize(clauseRow,'clause'),...prior.map((r,i)=>summarize(r,'prior-'+(prior.length-i)))],
 };
}
if(require.main===module){
 const [pythonPath,...rest]=process.argv.slice(2);
 diagnoseNasaLayout({pythonPath:rest.length?undefined:pythonPath}).then(result=>{
  console.log(JSON.stringify(result));
  if(result.status!=='LAYOUT_SUMMARY')process.exitCode=1;
 },()=>{
  console.log(JSON.stringify({schema:SCHEMA,status:'DIAGNOSTIC_BLOCKED',stage:'setup',fault:'NASA_DIAGNOSTIC_UNVERIFIED',paragraphs:[]}));
  process.exitCode=1;
 });
}
module.exports={diagnoseNasaLayout};
