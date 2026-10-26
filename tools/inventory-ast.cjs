'use strict';
// Lexical source map, not an execution trace. Runtime overrides require browser evidence.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const acorn=require('./parser/node_modules/acorn');
function analyze(source){
 const scopes=[{id:'global',parent:null,kind:'global',bindings:new Map()}],events=[],scripts=[],unresolved=[];
 const context=new WeakMap(),dispatcherNodes=[];let serial=0;
 const newScope=(kind,parent)=>{const s={id:'scope-'+(++serial),parent,kind,bindings:new Map()};scopes.push(s);return s};
 const declare=(scope,name,kind,line)=>{
  if(kind==='var')while(scope.parent&&scope.kind!=='function')scope=scope.parent;
  if(!scope.bindings.has(name))scope.bindings.set(name,{id:scope.id+':'+name,name,kind,line});
 };
 const names=node=>!node?[]:node.type==='Identifier'?[node.name]:node.type==='RestElement'?names(node.argument):node.type==='AssignmentPattern'?names(node.left):node.type==='ArrayPattern'?node.elements.flatMap(names):node.type==='ObjectPattern'?node.properties.flatMap(p=>names(p.type==='RestElement'?p.argument:p.value)):[];
 const resolve=(scope,name)=>{for(let s=scope;s;s=s.parent)if(s.bindings.has(name))return s.bindings.get(name).id;return 'unbound:'+name};
 const children=node=>Object.entries(node).filter(([k,v])=>!['loc','start','end'].includes(k)&&v&&typeof v==='object').flatMap(([,v])=>Array.isArray(v)?v:[v]).filter(v=>v&&typeof v.type==='string');
 const functions=new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']);
 function bind(node,scope,line){
  context.set(node,scope);
  if(node.type==='FunctionDeclaration'&&node.id){declare(scope,node.id.name,'function',line(node));dispatcherNodes.push(node);}
  if(functions.has(node.type)){
   const inner=newScope('function',scope);context.set(node,inner);
   if(node.id&&node.type!=='FunctionDeclaration')declare(inner,node.id.name,'function-name',line(node));
   for(const p of node.params)for(const name of names(p))declare(inner,name,'parameter',line(p));
   for(const p of node.params)bind(p,inner,line);
   bind(node.body,inner,line);return;
  }
  if(node.type==='BlockStatement'||node.type==='CatchClause'||node.type==='ForStatement'||node.type==='ForOfStatement'||node.type==='ForInStatement'){
   scope=newScope('block',scope);context.set(node,scope);
   if(node.type==='CatchClause')for(const name of names(node.param))declare(scope,name,'catch',line(node));
  }
  if(node.type==='VariableDeclaration')for(const d of node.declarations)for(const name of names(d.id))declare(scope,name,node.kind,line(d));
  if(node.type==='ClassDeclaration'&&node.id)declare(scope,node.id.name,'class',line(node));
  for(const child of children(node))bind(child,scope,line);
 }
 const member=node=>{
  if(node?.type==='Identifier')return {root:node.name,parts:[]};
  if(node?.type!=='MemberExpression')return null;
  const base=member(node.object);if(!base)return null;
  const key=node.computed?(node.property.type==='Literal'&&typeof node.property.value==='string'?node.property.value:null):node.property.name;
  if(key===null||key===undefined)return {...base,dynamic:true};
  return {...base,parts:[...base.parts,key]};
 };
 function visit(node,phase,script,line,immediate=false){
  const scope=context.get(node),site={script,line:line(node),scope:scope.id,activation:phase};
  if(node.type==='FunctionDeclaration')events.push({...site,kind:'function',target:node.id.name,binding:resolve(scope.parent,node.id.name)});
  if(node.type==='AssignmentExpression'){
   const m=member(node.left);if(m){
    const target=[m.root,...m.parts].join('.'),binding=resolve(scope,m.root);
    events.push({...site,kind:'assignment',target,binding,valueType:node.right.type,dynamic:!!m.dynamic});
    if(m.dynamic)unresolved.push({...site,reason:'computed-assignment',root:m.root});
   }
  }
  if(node.type==='MemberExpression'){
   const m=member(node);
   if(m?.root==='DB'&&m.parts.length===1&&!m.dynamic)events.push({...site,kind:'database-reference',target:m.parts[0],binding:resolve(scope,'DB')});
  }
  if(node.type==='CallExpression'||node.type==='NewExpression'){
   const m=member(node.callee),target=m?[m.root,...m.parts].join('.'):null;
   if(target&&(['act','defRoute'].includes(target)||/^(?:localStorage|sessionStorage|indexedDB)\./.test(target))){
    const arg=node.arguments[0],literal=arg?.type==='Literal'?arg.value:null;
    events.push({...site,kind:['act','defRoute'].includes(target)?'registration':'storage',target,argument:literal,binding:resolve(scope,m.root),dynamic:literal===null});
    if(literal===null)unresolved.push({...site,reason:'dynamic-call-argument',target});
   }
   if(target==='eval'||target==='Function')unresolved.push({...site,reason:'dynamic-code',target});
   if(functions.has(node.callee.type)){
    visit(node.callee,phase,script,line,true);for(const arg of node.arguments)visit(arg,phase,script,line);return;
   }
  }
  if(functions.has(node.type)){
   for(const p of node.params)visit(p,immediate?phase:'deferred',script,line);
   visit(node.body,immediate?phase:'deferred',script,line);return;
  }
  const branch=['IfStatement','ConditionalExpression','SwitchStatement','TryStatement','WhileStatement','ForStatement','ForInStatement','ForOfStatement','LogicalExpression'].includes(node.type);
  for(const child of children(node))visit(child,branch&&phase==='immediate'?'conditional':phase,script,line);
 }
 const parsed=[];
 for(const match of source.matchAll(/<!--[\s\S]*?-->|<(?:style|textarea|title)\b[^>]*>[\s\S]*?<\/(?:style|textarea|title)\s*>|<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  if(match[2]===undefined)continue;
  const ordinal=scripts.length+1,offset=match.index+match[0].indexOf('>')+1,base=source.slice(0,offset).split('\n').length;
  if(/\bsrc\s*=/.test(match[1])||/\btype\s*=\s*['"](?:application\/ld\+json|application\/json)['"]/.test(match[1])){unresolved.push({script:ordinal,line:base,reason:'external-or-data-script'});scripts.push({ordinal,line:base,parsed:false});continue;}
  const ast=acorn.parse(match[2],{ecmaVersion:2022,locations:true,sourceType:'script'}),line=n=>base+n.loc.start.line-1;
  scripts.push({ordinal,line:base,parsed:true});bind(ast,scopes[0],line);parsed.push({ast,line,ordinal});
 }
 for(const {ast,line,ordinal} of parsed)visit(ast,'immediate',ordinal,line);
 const dispatchers=new Map();
 for(const node of dispatcherNodes){
  const expression=node.body.body.length===1&&node.body.body[0].expression;
  if(node.params.length!==2||node.params.some(p=>p.type!=='Identifier')||expression?.type!=='AssignmentExpression'||expression.operator!=='=')continue;
  const left=expression.left;
  if(left.type!=='MemberExpression'||!left.computed||left.object.type!=='Identifier'||left.property.type!=='Identifier'||left.property.name!==node.params[0].name||expression.right.type!=='Identifier'||expression.right.name!==node.params[1].name)continue;
  const scope=context.get(node);dispatchers.set(resolve(scope.parent,node.id.name),{object:left.object.name,binding:resolve(scope,left.object.name)});
 }
 const chains=new Map();
 for(const e of events){
  if(e.kind!=='registration'&&e.kind!=='assignment')continue;
  const dispatcher=e.kind==='registration'&&typeof e.argument==='string'&&dispatchers.get(e.binding);
  const key=dispatcher?dispatcher.binding+':'+dispatcher.object+'.'+e.argument:e.kind==='registration'?e.binding+':'+e.target+':'+JSON.stringify(e.argument):e.binding+':'+e.target;
  if(!chains.has(key))chains.set(key,[]);chains.get(key).push(e);
 }
 return {contract:'MANA_LEXICAL_INVENTORY_V1',parser:{name:'acorn',version:acorn.version},sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),scripts,scopes:scopes.map(s=>({id:s.id,parent:s.parent?.id||null,kind:s.kind,bindings:[...s.bindings.values()]})),events,overrideCandidates:[...chains].filter(([,events])=>events.length>1).map(([identity,sites])=>({identity,sites})),unresolved,limitations:['Lexical bindings and source sites only; no runtime last-writer claim.','IIFEs retain caller activation; callbacks and named function bodies are deferred; branches are conservative candidates.','Loops/closures, function invocation, reflective access, aliases and dynamic keys require manual/browser analysis.','HTML script extraction assumes normal inline script markup; unsupported script syntax fails instead of emitting partial success.','Property paths do not establish object identity; object reassignment and aliases require review.','No claim of G1/G2 closure or financial workflow acceptance.']};
}
function summarize(report){
 const collections=new Map();
 for(const e of report.events.filter(e=>e.kind==='database-reference')){
  const key=e.binding+':'+e.target;if(!collections.has(key))collections.set(key,new Set());collections.get(key).add(e.line);
 }
 return {contract:'MANA_LEXICAL_SUMMARY_V1',parser:report.parser,sourceSha256:report.sourceSha256,scripts:report.scripts,scopeCount:report.scopes.length,eventCount:report.events.length,
  handlerChains:report.overrideCandidates.filter(c=>c.identity.startsWith('global:ACT:')).map(c=>({identity:c.identity,sites:c.sites.map(({line,script,activation,kind,scope})=>({line,script,activation,kind,scope}))})),
  routes:report.events.filter(e=>e.kind==='registration'&&e.target==='defRoute'),storage:report.events.filter(e=>e.kind==='storage'),
  databaseCollections:[...collections].map(([identity,lines])=>({identity,lines:[...lines].sort((a,b)=>a-b)})),unresolved:report.unresolved,limitations:report.limitations};
}
if(require.main===module){const report=analyze(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'));process.stdout.write(JSON.stringify(process.argv.includes('--summary')?summarize(report):report,null,2)+'\n');}
module.exports={analyze,summarize};
