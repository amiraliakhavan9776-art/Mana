'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildDimensionSkillGrammar,buildSkillGrammar}=require('../src/native/skill-grammar.cjs');
const {checkSkillDimensions,POLICY}=require('../src/native/skill-dimension-check.cjs');
// Independent bounded recognizer of emitted acyclic GBNF, not a llama.cpp binary test.
function compile(grammar){
 const rules=new Map();let nextId=0;const make=(kind,data)=>({id:nextId++,kind,...data});
 for(const line of grammar.trim().split('\n')){
  const [name,body]=line.split(' ::= ');assert.ok(name&&body);let end=0;
  const tokens=[...body.matchAll(/"(?:\\.|[^"\\])*"|\[[^\]]*\]|\{\d+(?:,\d*)?\}|[a-z][a-z0-9-]*|[()|?]/g)].map(m=>{assert.equal(body.slice(end,m.index).trim(),'');end=m.index+m[0].length;return m[0];});assert.equal(body.slice(end).trim(),'');let index=0;
  function alternation(){const nodes=[sequence()];while(tokens[index]==='|'){index++;nodes.push(sequence());}return nodes.length===1?nodes[0]:make('alt',{nodes});}
  function sequence(){const nodes=[];while(index<tokens.length&&!['|',')'].includes(tokens[index])){
   const token=tokens[index++];let node;
   if(token==='('){node=alternation();assert.equal(tokens[index++],')');}
   else if(token.startsWith('"'))node=make('literal',{text:JSON.parse(token)});
   else if(token.startsWith('['))node=make('character',{regex:new RegExp('^(?:'+token+')$')});
   else {assert.match(token,/^[a-z][a-z0-9-]*$/);node=make('reference',{name:token});}
   const q=tokens[index];if(q==='?'||q?.startsWith('{')){index++;const [min,max]=q==='?'?[0,1]:q.slice(1,-1).split(',').map(Number);node=make('repeat',{node,min,max:max??min});}nodes.push(node);
  }return nodes.length===1?nodes[0]:make('sequence',{nodes});}
  rules.set(name,alternation());assert.equal(index,tokens.length);
 }
 return text=>{const memo=new Map();let operations=0;
  function match(node,pos){const key=node.id+':'+pos;if(memo.has(key))return memo.get(key);if(++operations>1000000)throw Error('Test recognizer resource bound');let result=new Set();
   if(node.kind==='literal'){if(text.startsWith(node.text,pos))result.add(pos+node.text.length);}
   else if(node.kind==='character'){if(pos<text.length&&node.regex.test(text[pos]))result.add(pos+1);}
   else if(node.kind==='reference'){assert.ok(rules.has(node.name));result=match(rules.get(node.name),pos);}
   else if(node.kind==='alt'){for(const n of node.nodes)for(const p of match(n,pos))result.add(p);}
   else if(node.kind==='sequence'){result=new Set([pos]);for(const n of node.nodes){const out=new Set();for(const p of result)for(const q of match(n,p))out.add(q);result=out;if(!result.size)break;}}
   else if(node.kind==='repeat'){let positions=new Set([pos]);if(node.min===0)result.add(pos);for(let n=1;n<=node.max;n++){const next=new Set();for(const p of positions)for(const q of match(node.node,p))next.add(q);positions=next;if(n>=node.min)for(const p of positions)result.add(p);if(!positions.size)break;}}
   memo.set(key,result);return result;
  }return match(rules.get('root'),0).has(text.length);
 };
}
const f=x=>({field:x}),v=x=>({value:x}),op=(name,...args)=>({op:name,args});
const fields=['length_m','width_m','thickness_mm','excluded_area_m2'];
test('dimensioned volume root accepts multiple generic factorizations and scale division, rejects bare lengths',()=>{
 const grammar=buildDimensionSkillGrammar(fields,{expectedPower:3}),accept=compile(grammar);
 const expressions=[op('multiply',op('multiply',f('length_m'),f('width_m')),f('thickness_mm')),op('divide',op('multiply',f('length_m'),op('multiply',f('width_m'),f('thickness_mm'))),v(1000)),op('multiply',op('subtract',op('multiply',f('length_m'),f('width_m')),f('excluded_area_m2')),op('divide',f('thickness_mm'),v(1000)))];
 for(const expr of expressions){assert.equal(accept(JSON.stringify(expr)),true);assert.equal(checkSkillDimensions(expr,fields,{schema:POLICY,expectedPower:3,requiredFields:[],counterfactualPairs:[]}).ok,true);}
 for(const expr of [f('length_m'),f('thickness_mm'),op('multiply',f('length_m'),f('width_m')),op('add',f('length_m'),f('excluded_area_m2')),v(0),v(true)])assert.equal(accept(JSON.stringify(expr)),false);
});
test('same-power operations and contextual area zero clamps accepted; invalid fields, literals and arity rejected',()=>{
 const accept=compile(buildDimensionSkillGrammar(fields,{expectedPower:2}));
 for(const expr of [op('max',v(0),f('excluded_area_m2')),op('subtract',op('multiply',f('length_m'),f('width_m')),f('excluded_area_m2')),op('min',f('excluded_area_m2'),f('excluded_area_m2'))])assert.equal(accept(JSON.stringify(expr)),true);
 for(const source of ['{"field":"unknown"}','{"value":0}','{"op":"max","args":[{"value":1},{"field":"excluded_area_m2"}]}','{"op":"multiply","args":[{"field":"length_m"}]}','{"op":"multiply","args":[{"field":"length_m"},{"value":1.5}]}'])assert.equal(accept(source),false);
});
test('grammar is acyclic, size/rule bounded, deterministic and excludes unreachable dimensional roots',()=>{
 const before=buildSkillGrammar(['x']);
 for(const expectedPower of [-4,-3,-2,-1,0,1,2,3,4]){const g=buildDimensionSkillGrammar(fields,{expectedPower});assert.ok(Buffer.byteLength(g)<=65536);assert.ok(g.trim().split('\n').length<=64);for(const line of g.split('\n')){const m=line.match(/^dim-(\d)-/);if(m)for(const ref of line.split(' ::= ')[1].matchAll(/dim-(\d)-[pn]\d/g))assert.ok(Number(ref[1])<Number(m[1]));}}
 assert.equal(buildDimensionSkillGrammar(fields,{expectedPower:3}),buildDimensionSkillGrammar([...fields].reverse(),{expectedPower:3}));
 assert.throws(()=>buildDimensionSkillGrammar([],{expectedPower:3}),/No dimensional/);assert.equal(buildSkillGrammar(['x']),before);
 for(const [fs,options] of [[fields,{expectedPower:5}],[fields,{expectedPower:1.5}],[fields,{}],[fields,{expectedPower:3,extra:1}],[['height_m'],{expectedPower:3}],[['length_m','length_m'],{expectedPower:3}],[['x"\nroot ::= .*'],{expectedPower:3}]])assert.throws(()=>buildDimensionSkillGrammar(fs,options));
});
