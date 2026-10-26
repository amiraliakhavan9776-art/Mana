'use strict';
// Static index only: occurrence order is not proof of lexical scope or runtime ownership.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
function inventory(source){
 const line=offset=>source.slice(0,offset).split('\n').length;
 const matches=regex=>[...source.matchAll(regex)].map(m=>({name:m[1],line:line(m.index)}));
 const functions=matches(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g);
 const names=new Map();for(const f of functions)names.set(f.name,[...(names.get(f.name)||[]),f.line]);
 const scripts=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((m,i)=>({ordinal:i+1,startLine:line(m.index),endLine:line(m.index+m[0].length),sha256:createHash('sha256').update(m[1]).digest('hex')}));
 return {
  sourceSha256:createHash('sha256').update(source).digest('hex'),
  limitations:['Static candidates only; comments/strings can match.','Repeated names may be local to different closures. Resolve scope and effective overrides before changing code.','DB references are not a validated schema; dynamic keys and nested fields require review.'],
  scripts,functions,repeatedFunctionNames:[...names].filter(([,lines])=>lines.length>1).map(([name,lines])=>({name,lines})),
  handlers:matches(/\bact\(\s*['"]([^'"]+)['"]/g),
  handlerOverrides:matches(/\bACT\[['"]([^'"]+)['"]\]\s*=/g),
  routeCandidates:matches(/\bk:\s*['"]([^'"]+)['"]/g),
  routeDefinitions:matches(/\bdefRoute\(\s*['"]([^'"]+)['"]/g),
  renderAssignments:matches(/\b((?:window\.)?(?:ROUTES|routes|renderers)\.[\w$]+(?:\.[\w$]+)*)\s*=/g),
  assignmentCandidates:matches(/\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*=\s*function\b/g),
  databaseReferences:matches(/\bDB\.([A-Za-z_$][\w$]*)/g),
  storageOperations:matches(/\b((?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem|clear)|indexedDB\.open)\s*\(/g),
  persistenceDeclarations:matches(/\b(?:LS_KEY|KEY|DB_NAME|DB_VER|STORE)\s*=\s*['"]([^'"]+)['"]/g)
 };
}
if(require.main===module){
 const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 process.stdout.write(JSON.stringify(inventory(source),null,2)+'\n');
}
module.exports={inventory};
