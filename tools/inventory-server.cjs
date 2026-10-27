'use strict';
// Static inspection of an explicitly supplied snapshot. Never require/import its modules.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const acorn=require('./parser/node_modules/acorn');
const builtins=new Set(require('node:module').builtinModules.map(x=>x.replace(/^node:/,'')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function inventoryServer(directory){
 const root=path.resolve(directory),files=[];
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1)){
  if(entry.isSymbolicLink())throw Error('Snapshot symlinks denied');
  const absolute=path.join(dir,entry.name);
  if(entry.isDirectory())walk(absolute);
  else if(entry.isFile()){
   if(files.length>=500||fs.statSync(absolute).size>200000)throw Error('Snapshot bounds exceeded');files.push(absolute);
  }else throw Error('Unsupported snapshot entry');
 }}
 const stat=fs.lstatSync(root);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Regular snapshot directory required');walk(root);
 let total=0;
 const entries=files.map(file=>{
  const bytes=fs.readFileSync(file);total+=bytes.length;if(total>5000000)throw Error('Snapshot byte bound exceeded');
  const name=path.relative(root,file).split(path.sep).join('/'),result={path:name,bytes:bytes.length,sha256:hash(bytes)};
  if(!/\.(?:cjs|mjs|js)$/.test(file))return result;
  let ast;try{ast=acorn.parse(bytes.toString('utf8'),{ecmaVersion:2022,locations:true,sourceType:file.endsWith('.mjs')?'module':'script'});}catch(error){return {...result,syntaxParsed:false,parseError:{message:'Unsupported or invalid JavaScript syntax',line:error.loc?.line??null,column:error.loc?.column??null}};}
  const imports=[],effects=[];
  function member(n){if(n?.type==='Identifier')return n.name;if(n?.type==='MemberExpression'&&!n.computed){const base=member(n.object);return base?base+'.'+n.property.name:null;}return null;}
  function visit(node,deferred=false){
   const isFunction=['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type);
   if(node.type==='CallExpression'){
    const call=member(node.callee),value=node.arguments[0]?.type==='Literal'?node.arguments[0].value:null;
    if(['require','appRequire','createRequire'].includes(call)){
     let status='dynamic',resolved=null;
     if(typeof value==='string'){
      if(value.startsWith('node:')||builtins.has(value))status='node_builtin';
      else if(value.startsWith('.')){const p=path.resolve(path.dirname(file),value);resolved=path.relative(root,p).split(path.sep).join('/');status=p.startsWith(root+path.sep)?fs.existsSync(p)?'in_snapshot':'not_in_snapshot':'outside_snapshot';}
      else status=path.isAbsolute(value)?'absolute_host_dependency':'external_package';
     }
     imports.push({line:node.loc.start.line,loader:call,specifier:value,status,...(resolved?{resolved}:{})});
    }
    if(call&&(/\b(?:writeFileSync|appendFileSync|mkdirSync|renameSync|unlinkSync|spawnSync|spawn|exec|execSync|request|listen)$/.test(call)||call==='fetch'))effects.push({line:node.loc.start.line,call,activation:deferred?'function_body':'top_level_candidate'});
   }
   for(const [key,value] of Object.entries(node)){
    if(['loc','start','end'].includes(key)||!value||typeof value!=='object')continue;
    for(const child of Array.isArray(value)?value:[value])if(child&&typeof child.type==='string')visit(child,deferred||isFunction);
   }
  }
  visit(ast);return {...result,syntaxParsed:true,imports,effectCandidates:effects};
 });
 return {contract:'MANA_SERVER_SOURCE_INVENTORY_V1',parser:{name:'acorn',version:acorn.version},fileCount:entries.length,sourceBytes:total,syntaxErrorCount:entries.filter(e=>e.syntaxParsed===false).length,sourceSetDigest:hash(JSON.stringify(entries.map(({path,sha256})=>({path,sha256})))),files:entries,limitations:['Provided source snapshot only; absent files/dependencies are not proof of absence on the live host.','Syntax errors are explicitly reported per file; unparsed files have no claimed import/effect coverage.','Function-body versus top-level call sites are lexical candidates, not an execution/call graph.','No source module was loaded, generated candidate executed, server contacted or data migrated.','JSON data/config/state, model weights, systemd/Nginx configuration and live identity/database dependencies require separate scoped evidence.']};
}
if(require.main===module){if(process.argv.length!==3)throw Error('Usage: node tools/inventory-server.cjs SNAPSHOT_DIRECTORY');process.stdout.write(JSON.stringify(inventoryServer(process.argv[2]),null,2)+'\n');}
module.exports={inventoryServer};
