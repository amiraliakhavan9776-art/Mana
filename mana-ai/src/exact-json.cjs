'use strict';
// Parse original tokens before duplicate keys or binary rounding hide evidence.
function parseExactJSON(text){
 if(typeof text!=='string')throw Error('JSON text required');
 const parsed=JSON.parse(text),stack=[];
 const tokens=text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\],:]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g);
 for(const [token] of tokens){
  const top=stack[stack.length-1];
  if(token==='{')stack.push({keys:new Set(),expectKey:true});
  else if(token==='[')stack.push({keys:null});
  else if(token==='}'||token===']')stack.pop();
  else if(token===','&&top?.keys)top.expectKey=true;
  else if(token===':'&&top?.keys)top.expectKey=false;
  else if(token[0]==='"'&&top?.keys&&top.expectKey){
   const key=JSON.parse(token);if(top.keys.has(key))throw Error('Duplicate JSON key requires quarantine');top.keys.add(key);
  }else if(/^-?\d/.test(token)&&(!/^-?(?:0|[1-9]\d*)$/.test(token)||!Number.isSafeInteger(Number(token))))throw Error('Unsafe numeric representation requires reviewed string mapping');
 }
 return parsed;
}
module.exports={parseExactJSON};
