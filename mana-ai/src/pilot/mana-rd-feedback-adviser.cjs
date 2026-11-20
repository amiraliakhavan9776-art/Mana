'use strict';
const {createBoundedLocalCompletion}=require('./mana-text-model.cjs');
const {createHash}=require('node:crypto'),fs=require('node:fs');
function createFeedbackAdviser({port,model}){
 if(typeof model!=='string'||!/^[A-Za-z0-9._:/-]{1,100}$/.test(model)||model.includes('://')||!Number.isInteger(port)||port<1||port>65535)throw Error('Explicit bounded local model required');
 const system='Output exactly one arithmetic expression in the supplied JSON grammar. No prose, package, tools, shell, file or network access. Use the named inputs. The prior expression was rejected because the listed ineffective inputs did not independently affect its result. Do not ignore, cancel, or replace those inputs with constants. No examples or benchmark values are supplied.';
 const transportSha256=createHash('sha256').update(fs.readFileSync(__filename)).update(fs.readFileSync(require.resolve('./mana-text-model.cjs'))).digest('hex');
 return {providerId:port+':'+model,transportSha256,propose:async({goal,fields,outputUnit,maxInput,notes,grammar,ineffectiveFields})=>{
  const answer=createBoundedLocalCompletion({port,model,timeoutMs:30000},system,grammar);
  const r=await answer({text:JSON.stringify({goal,fields,outputUnit,maxInput,notes,ineffectiveFields})});if(r.status!=='TEXT_ANSWER')throw Error('No verified local repair proposal');return r.text;
 }};
}
module.exports={createFeedbackAdviser};
