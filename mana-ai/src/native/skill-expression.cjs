'use strict';
// Deliberately bounded declarative skills. Never eval, import or execute model code.
const OPS={add:2,subtract:2,multiply:2,divide:2,min:2,max:2,less:2,equal:2,if:3};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const keys=(x,expected)=>plain(x)&&Object.keys(x).sort().join(',')===[...expected].sort().join(',');
const scalar=x=>typeof x==='boolean'||(typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e12);
function validateExpression(expression,fields){
 if(!Array.isArray(fields)||fields.length>16||new Set(fields).size!==fields.length||fields.some(x=>typeof x!=='string'||!/^[a-z][a-z0-9_]{0,39}$/.test(x)||['constructor','prototype','__proto__'].includes(x)))throw Error('Invalid skill fields');
 let count=0;
 function walk(x,depth){if(++count>128||depth>12)throw Error('Expression budget exceeded');
  if(keys(x,['value'])){if(!scalar(x.value))throw Error('Invalid literal');return;}
  if(keys(x,['field'])){if(!fields.includes(x.field))throw Error('Unknown field');return;}
  if(!keys(x,['op','args'])||!Object.hasOwn(OPS,x.op)||!Array.isArray(x.args)||x.args.length!==OPS[x.op])throw Error('Invalid expression');
  x.args.forEach(v=>walk(v,depth+1));
 }walk(expression,0);return true;
}
function evaluateExpression(expression,input,fields){
 validateExpression(expression,fields);
 if(!keys(input,fields)||!Object.values(input).every(scalar))throw Error('Invalid input');
 function numeric(x){if(typeof x!=='number'||!scalar(x))throw Error('Numeric value required');return x;}
 function run(x){if(Object.hasOwn(x,'value'))return x.value;if(Object.hasOwn(x,'field'))return input[x.field];
  if(x.op==='if'){const condition=run(x.args[0]);if(typeof condition!=='boolean')throw Error('Boolean condition required');return run(x.args[condition?1:2]);}
  const a=run(x.args[0]),b=run(x.args[1]);if(x.op==='equal')return a===b;
  numeric(a);numeric(b);let result;
  switch(x.op){case 'add':result=a+b;break;case 'subtract':result=a-b;break;case 'multiply':result=a*b;break;case 'divide':if(b===0)throw Error('Division by zero');result=a/b;break;case 'min':result=Math.min(a,b);break;case 'max':result=Math.max(a,b);break;case 'less':return a<b;}
  return numeric(result);
 }return run(expression);
}
module.exports={validateExpression,evaluateExpression};
