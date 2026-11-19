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
module.exports={buildSkillGrammar,POLICY,MAX_DEPTH};
