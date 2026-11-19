'use strict';
// Managed opt-in subset, not a replacement for the native evaluator.
// GBNF API/syntax: https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md
// Request grammar: https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
const {validateExpression}=require('./skill-expression.cjs');
const POLICY='llama-gbnf-v1';
const MAX_DEPTH=4; // Full ternary tree has 121 nodes, within native limit128.
const literal=x=>JSON.stringify(x);
function buildSkillGrammar(fields){
 validateExpression({value:0},fields);
 const ws=' ws ',key=name=>literal(JSON.stringify(name))+ws+literal(':')+ws;
 const leaf=literal('{')+ws+key('value')+'scalar'+ws+literal('}');
 const lines=['root ::= ws node-0 ws','ws ::= [ \\t\\n\\r]{0,16}',
  'scalar ::= integer | "true" | "false"',
  'integer ::= "-"? ("0" | [1-9] [0-9]{0,11} | "1000000000000")',
  'binary-op ::= '+['add','subtract','multiply','divide','min','max','less','equal'].map(x=>literal(JSON.stringify(x))).join(' | '),
  'leaf ::= '+leaf+(fields.length?' | '+literal('{')+ws+key('field')+'field-name'+ws+literal('}'):'')];
 if(fields.length)lines.push('field-name ::= '+[...fields].sort().map(x=>literal(JSON.stringify(x))).join(' | '));
 for(let depth=0;depth<=MAX_DEPTH;depth++){
  let rule='node-'+depth+' ::= leaf';
  if(depth<MAX_DEPTH){const node='node-'+(depth+1),prefix=literal('{')+ws+key('op'),args=ws+literal(',')+ws+key('args')+literal('[')+ws,suffix=ws+literal(']')+ws+literal('}'),comma=ws+literal(',')+ws;
   rule+=' | '+prefix+'binary-op'+args+node+comma+node+suffix;
   rule+=' | '+prefix+literal(JSON.stringify('if'))+args+node+comma+node+comma+node+suffix;
  }lines.push(rule);
 }
 const grammar=lines.join('\n')+'\n';if(Buffer.byteLength(grammar)>8192)throw Error('Managed grammar bound exceeded');return grammar;
}
// Dimension-aware opt-in subset. Units are length powers only, not scale factors.
const DIMENSION_POLICY='llama-dimension-gbnf-v1';
const DIMENSION_POWERS=Object.freeze({length_m:1,width_m:1,thickness_mm:1,excluded_area_m2:2});
function buildDimensionSkillGrammar(fields,options){
 validateExpression({value:0},fields);
 if(!options||Array.isArray(options)||typeof options!=='object'||Object.getPrototypeOf(options)!==Object.prototype||Object.keys(options).join(',')!=='expectedPower'||!Number.isInteger(options.expectedPower)||Math.abs(options.expectedPower)>4||fields.some(f=>!Object.hasOwn(DIMENSION_POWERS,f)))throw Error('Invalid dimensional grammar contract');
 const ws=' ws ',key=name=>literal(JSON.stringify(name))+ws+literal(':')+ws;
 const name=(depth,power)=>'dim-'+depth+'-'+(power<0?'n'+(-power):'p'+power);
 const fieldNames=power=>fields.filter(f=>DIMENSION_POWERS[f]===power).sort();
 const valueLeaf=literal('{')+ws+key('value')+'integer'+ws+literal('}');
 const zero=literal('{')+ws+key('value')+literal('0')+ws+literal('}');
 const rules=new Map(),reachable=new Map();
 const binary=(operator,a,b)=>literal('{')+ws+key('op')+operator+ws+literal(',')+ws+key('args')+literal('[')+ws+a+ws+literal(',')+ws+b+ws+literal(']')+ws+literal('}');
 for(let depth=0;depth<=MAX_DEPTH;depth++){
  const available=new Set();
  for(let power=-4;power<=4;power++){
   const alternatives=[];
   if(power===0)alternatives.push(valueLeaf);
   if(fieldNames(power).length)alternatives.push(literal('{')+ws+key('field')+'fields-p'+power+ws+literal('}'));
   if(depth>0){
    const children=reachable.get(depth-1);
    if(children.has(power))alternatives.push(binary('same-unit-op',name(depth-1,power),name(depth-1,power)));
    for(const a of [...children].sort((x,y)=>x-y))for(const b of [...children].sort((x,y)=>x-y)){
     if(a+b===power)alternatives.push(binary(literal(JSON.stringify('multiply')),name(depth-1,a),name(depth-1,b)));
     if(a-b===power)alternatives.push(binary(literal(JSON.stringify('divide')),name(depth-1,a),name(depth-1,b)));
    }
    // Typed zero is contextual, never a dimensioned literal at the root.
    if(power===2&&children.has(2)){
     alternatives.push(binary('clamp-op','zero',name(depth-1,2)));
     alternatives.push(binary('clamp-op',name(depth-1,2),'zero'));
    }
   }
   if(alternatives.length){rules.set(name(depth,power),alternatives.join(' | '));available.add(power);}
  }reachable.set(depth,available);
 }
 if(!reachable.get(MAX_DEPTH).has(options.expectedPower))throw Error('No dimensional expression available');
 const lines=['root ::= ws '+name(MAX_DEPTH,options.expectedPower)+' ws','ws ::= [ \\t\\n\\r]{0,16}',
  'integer ::= "-"? ("0" | [1-9] [0-9]{0,11} | "1000000000000")',
  'same-unit-op ::= '+['add','subtract','min','max'].map(x=>literal(JSON.stringify(x))).join(' | '),
  'clamp-op ::= '+['min','max'].map(x=>literal(JSON.stringify(x))).join(' | '),'zero ::= '+zero];
 for(const power of [1,2])if(fieldNames(power).length)lines.push('fields-p'+power+' ::= '+fieldNames(power).map(x=>literal(JSON.stringify(x))).join(' | '));
 const used=new Set();function visit(rule){if(used.has(rule))return;used.add(rule);for(const [child] of rules.get(rule).matchAll(/\bdim-\d-[np]\d\b/g))visit(child);}
 visit(name(MAX_DEPTH,options.expectedPower));
 for(const [rule,body] of rules)if(used.has(rule))lines.push(rule+' ::= '+body);
 const grammar=lines.join('\n')+'\n';
 if(lines.length>64||Buffer.byteLength(grammar)>65536)throw Error('Dimensional grammar resource bound exceeded');
 return grammar;
}
module.exports={buildSkillGrammar,POLICY,MAX_DEPTH,buildDimensionSkillGrammar,DIMENSION_POLICY};
