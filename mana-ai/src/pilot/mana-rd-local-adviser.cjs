'use strict';
const {createBoundedLocalCompletion}=require('./mana-text-model.cjs');
const {createHash}=require('node:crypto'),fs=require('node:fs');
function createRdLocalAdviser({port,model}){
 const system='Output exactly one arithmetic expression in the supplied JSON grammar. No prose, package, tools, shell, file or network access. Input values are nonnegative integral millimetres; output unit is specified. Use the named inputs, not samples or guessed constants.';
 const transportSha256=createHash('sha256').update(fs.readFileSync(__filename)).update(fs.readFileSync(require.resolve('./mana-text-model.cjs'))).digest('hex');
 if(typeof model!=='string'||!/^[A-Za-z0-9._:/-]{1,100}$/.test(model)||model.includes('://'))throw Error('Explicit bounded local model required');
 return {providerId:port+':'+model,transportSha256,propose:async({goal,fields,outputUnit,maxInput,notes,grammar})=>{
  const answer=createBoundedLocalCompletion({port,model,timeoutMs:30000},system,grammar);
  const r=await answer({text:JSON.stringify({goal,fields,outputUnit,maxInput,notes})});if(r.status!=='TEXT_ANSWER')throw Error('No verified local proposal');return r.text;
 }};
}
module.exports={createRdLocalAdviser};
