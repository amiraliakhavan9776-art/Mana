#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const OPS=['add','subtract','multiply','min','max'], FIELDS=['first_mm','second_mm'];
const DEFS=[
 {id:'combined-length',task:'Two independently measured lengths. Return their total length.',reference:(a,b)=>a+b,probes:[[13,26,9,19],[431,537,311,438]],cases:[[0,0],[0,7001],[300,0],[100,200],[998,355],[1254,950],[12975,17539],[100000,1],[1,100000],[100000,100000]]},
 {id:'remaining-length',task:'First is available length and second is consumed length. Return the remaining length, floored at zero if consumption meets or exceeds availability.',reference:(a,b)=>Math.max(0,a-b),probes:[[67,87,12,23],[5010,8326,505,2013]],cases:[[0,0],[0,7001],[300,0],[100,200],[998,355],[1254,950],[1000,1000],[100000,1],[1,100000],[100000,100000]]},
 {id:'controlling-clearance',task:'Two independently measured clearances. Return the larger clearance, without adding the two.',reference:(a,b)=>Math.max(a,b),probes:[[20,38,25,44],[412,538,486,803]],cases:[[0,0],[0,7001],[300,0],[100,200],[998,355],[1254,950],[875,875],[100000,1],[1,100000],[100000,100000]]}
];
const ORDER=[['json','prefix'],['prefix','json'],['json','prefix']];
const CELLS=DEFS.flatMap((task,i)=>ORDER[i].map(format=>({task,format})));
const LIMIT=4, PORT=8794, TIMEOUT=30000;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),digest=x=>hash(JSON.stringify(x));
const flags={trainingPerformed:false,activationPerformed:false,generatedCodeExecuted:false,allProposalsLocal:true};
function grammar(format){
 const q=JSON.stringify,term=x=>q(x),json=format==='json',op=OPS.map(x=>q(json?q(x):x)).join(' | ');
 const rules=['root ::= ws n4 ws','ws ::= [ ]{0,4}','integer ::= ("0" | [1-9] [0-9]{0,3})'];
 const fields=FIELDS.map(x=>q(json?JSON.stringify({field:x}):x));
 const literals=json?term('{"value":')+' ws integer ws '+term('}'): 'integer';
 rules.push('n0 ::= '+[...fields,literals].join(' | '));
 for(let i=1;i<=LIMIT;i++){
  const child='n'+(i-1);
  rules.push('n'+i+' ::= n0 | '+(json?term('{"op":')+' ws ('+op+') ws '+term(',"args":[')+' ws '+child+' ws '+term(',')+' ws '+child+' ws '+term(']}'):'('+op+') ws '+term('(')+' ws '+child+' ws '+term(',')+' ws '+child+' ws '+term(')')));
 }
 return rules.join('\n');
}
function decode(text,format){
 if(typeof text!=='string'||Buffer.byteLength(text)>4096)throw Error('candidate size');
 // Both grammars use ASCII with no spaces inside strings/tokens. A bounded
 // lexing pass preserves token boundaries and rejects split names/numbers.
 const raw=text;
 const re=/[ \t\r\n]{1,4}|"[a-z_]+"|[a-z_]+|[0-9]+|[{}\[\]():,]/gy;
 const tokens=[];let off=0;
 while(off<raw.length){re.lastIndex=off;const m=re.exec(raw);if(!m)throw Error('invalid token');if(!/^[ \t\r\n]/.test(m[0]))tokens.push(m[0]);off=re.lastIndex;}
 let i=0;const take=tok=>{if(tokens[i++]!==tok)throw Error('unexpected token');};
 function literal(v){if(!/^(0|[1-9][0-9]{0,3})$/.test(v||''))throw Error('literal');return {value:Number(v)};}
 function expression(d){
  if(d>LIMIT)throw Error('depth');
  if(format==='json'){
   take('{');const key=tokens[i++];take(':');
   if(key==='"field"'){const value=tokens[i++];const field=value?.slice(1,-1);if(!FIELDS.includes(field)||value!==JSON.stringify(field))throw Error('field');take('}');return{field};}
   if(key==='"value"'){const result=literal(tokens[i++]);take('}');return result;}
   if(key!=='"op"')throw Error('node');
   const value=tokens[i++],op=value?.slice(1,-1);if(!OPS.includes(op)||value!==JSON.stringify(op))throw Error('operator');
   take(',');take('"args"');take(':');take('[');const left=expression(d+1);take(',');const right=expression(d+1);take(']');take('}');return {op,args:[left,right]};
  }
  const token=tokens[i++];
  if(FIELDS.includes(token))return {field:token};
  if(!OPS.includes(token))return literal(token);
  take('(');const left=expression(d+1);take(',');const right=expression(d+1);take(')');return {op:token,args:[left,right]};
 }
 const out=expression(0);if(i!==tokens.length)throw Error('trailing input');return out;
}
function calculate(x,a,b){
 if(Object.hasOwn(x,'field'))return x.field===FIELDS[0]?a:b;
 if(Object.hasOwn(x,'value'))return x.value;
 const v=calculate(x.args[0],a,b),w=calculate(x.args[1],a,b);let r;
 switch(x.op){case 'add':r=v+w;break;case 'subtract':r=v-w;break;case 'multiply':r=v*w;break;case 'min':r=Math.min(v,w);break;case 'max':r=Math.max(v,w);break;default:throw Error('unknown arithmetic');}
 if(!Number.isSafeInteger(r))throw Error('arithmetic range');return r;
}
function assess(task,format,text){
 const base={task:task.id,format,transport:'RESPONSE',formatValid:false,probe:null,score:null,candidate:null};
 let ast;try{ast=decode(text,format);}catch{return {...base,status:'INVALID_FORMAT'};}
 const probe=FIELDS.map((field,i)=>({field,effective:task.probes.every(([a,b,x,y])=>{
  try{const v=calculate(ast,a,x),w=i===0?calculate(ast,b,x):calculate(ast,a,y);return v!==w;}catch{return false;}
 })}));
 let passed=0;for(const [a,b]of task.cases){try{if(calculate(ast,a,b)===task.reference(a,b))passed++;}catch{/* fails case */}}
 const dependent=probe.every(x=>x.effective),score={passed,total:task.cases.length};
 return {...base,formatValid:true,probe,score,candidate:ast,status:!dependent?'INPUT_NOT_EFFECTIVE':passed===score.total?'PASSED':'NUMERIC_FAILURE'};
}
function complete({model,task,format,port=PORT,timeoutMs=TIMEOUT}){
 const label=format==='json'?'Each node is an object with exactly one field key, or one integer value key, or an op key followed by an args array of two nodes.':'Each node is a bare field name, an integer literal, or an operator called with two comma-separated child nodes inside parentheses.';
 const messages=[{role:'system',content:'Return only a single arithmetic expression in the supplied grammar. No reasoning or prose. '+label+' The allowed binary operators are '+OPS.join(', ')+'. The allowed fields are '+FIELDS.join(', ')+'.'},{role:'user',content:task.task+' Both inputs are integers in millimetres from 0 through 100000 inclusive. first_mm is the first input; second_mm is the second input. Return the result in millimetres without changing units.'}];
 const payload=Buffer.from(JSON.stringify({model,messages,grammar:grammar(format),max_tokens:256,temperature:0,stream:false}));
 return new Promise(resolve=>{
  let req,timer,done=false;
  const finish=res=>{if(done)return;done=true;clearTimeout(timer);resolve(res);};
  const fail=kind=>{finish({kind});req?.destroy();};
  try{
   req=http.request({hostname:'127.0.0.1',family:4,port,path:'/v1/chat/completions',method:'POST',agent:false,maxHeaderSize:8192,headers:{'Content-Type':'application/json','Content-Length':payload.length,Accept:'application/json','Accept-Encoding':'identity'}},res=>{
    if(res.statusCode!==200)return fail('HTTP_ERROR');
    if(!/^application\/json(?:\s*;.*)?$/i.test(res.headers['content-type']||'')||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity')return fail('INVALID_ENVELOPE');
    const chunks=[];let size=0;
    res.on('data',c=>{size+=c.length;if(size>32768)return fail('RESPONSE_TOO_LARGE');if(!done)chunks.push(c);});
    res.once('error',()=>fail('TRANSPORT_ERROR'));res.once('aborted',()=>fail('TRANSPORT_ERROR'));
    res.once('end',()=>{if(done)return;try{
     const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));
     const choice=body?.choices?.[0],m=choice?.message;
     if(!Array.isArray(body?.choices)||body.choices.length!==1||!m||(m.role!==undefined&&m.role!=='assistant')||m.function_call!=null||m.tool_calls!=null&&(!Array.isArray(m.tool_calls)||m.tool_calls.length))return fail('INVALID_ENVELOPE');
     if(choice.finish_reason!==undefined&&choice.finish_reason!=='stop')return finish({kind:'MODEL_INCOMPLETE'});
     if(typeof m.content!=='string')return fail('INVALID_ENVELOPE');finish({kind:'RESPONSE',text:m.content});
    }catch{fail('INVALID_ENVELOPE');}});
   });
   req.once('error',()=>fail('TRANSPORT_ERROR'));timer=setTimeout(()=>fail('TIMEOUT'),timeoutMs);req.end(payload);
  }catch{fail('TRANSPORT_ERROR');}
 });
}
function privateWorkspace(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir)||path.resolve(dir)!==dir||fs.realpathSync(dir)!==dir)throw Error('Absolute private workspace required');
 const st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)||(process.getuid&&st.uid!==process.getuid()))throw Error('Private owned workspace required');
 return {dev:st.dev,ino:st.ino};
}
function sync(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function write(dir,name,value){const fd=fs.openSync(path.join(dir,name),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}sync(dir);}
function read(dir,name){const fd=fs.openSync(path.join(dir,name),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);try{const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size<1||s.size>64000||(s.mode&0o077)||(process.getuid&&s.uid!==process.getuid()))throw Error('Invalid diagnostic evidence');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(fd)));}finally{fs.closeSync(fd);}}
const dispatchName=i=>'dispatch-'+String(i+1).padStart(2,'0')+'.json';
const cellName=i=>'cell-'+String(i+1).padStart(2,'0')+'.json';
const INPUT_STOP=new Set(['TIMEOUT','TRANSPORT_ERROR','HTTP_ERROR','INVALID_ENVELOPE','RESPONSE_TOO_LARGE']);
function emptyOutcome(cell,kind){return {task:cell.task.id,format:cell.format,transport:kind,formatValid:false,probe:null,score:null,candidate:null,status:kind};}
function syntax(ast,format){if(format==='json')return JSON.stringify(ast);if(Object.hasOwn(ast,'field'))return ast.field;if(Object.hasOwn(ast,'value'))return String(ast.value);return ast.op+'('+ast.args.map(x=>syntax(x,format)).join(',')+')';}
function validResult(r,i){
 const c=CELLS[i];if(!r||r.format!==c.format||r.task!==c.task.id)return false;
 try{
  const legit=r.transport==='RESPONSE'?assess(c.task,c.format,r.candidate?syntax(r.candidate,c.format):''):INPUT_STOP.has(r.transport)||r.transport==='MODEL_INCOMPLETE'?emptyOutcome(c,r.transport):null;
  return legit!==null&&digest(legit)===digest(r);
 }catch{return false;}
}
function summarize(results){
 return Object.fromEntries(['json','prefix'].map(format=>[format,{observed:results.filter(x=>x.format===format).length,validFormat:results.filter(x=>x.format===format&&x.formatValid).length,passed:results.filter(x=>x.format===format&&x.status==='PASSED').length}]));
}
async function benchmark({workspace,model,port=PORT,timeoutMs=TIMEOUT,readOnly=false}={}){
 if(typeof model!=='string'||model.includes('://')||!/^[A-Za-z0-9._:/-]{1,100}$/.test(model)||!Number.isInteger(port)||port<1||port>65535||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>TIMEOUT)throw Error('Explicit bounded local model required');
 const identity=privateWorkspace(workspace),source=hash(fs.readFileSync(__filename)),binding=digest({workspace,identity,source,model,port,timeoutMs}),results=[];
 let sent=0,pending=null;
 const check=()=>{if(digest(privateWorkspace(workspace))!==digest(identity)||hash(fs.readFileSync(__filename))!==source)throw Error('Diagnostic evidence changed');};
 const answer=(status,reused=false)=>({schema:'MANA_FORMAT_BENCH_REPORT_V1',status,reused,modelRequestsAttemptedThisInvocation:sent,totalPlanned:6,pending,unattempted:6-results.length-(pending?1:0),summary:summarize(results),results,...flags});
 const files=fs.readdirSync(workspace);
 if(files.length){
  try{
   const claim=read(workspace,'claim.json');if(claim.schema!=='MANA_FORMAT_BENCH_CLAIM_V1'||claim.binding!==binding||claim.budget!==6)throw Error('Unverified claim');
   if(files.some(f=>!['claim.json','receipt.json',...CELLS.flatMap((_,i)=>[cellName(i),dispatchName(i)])].includes(f)))throw Error('Unrecognized evidence');
   for(const [i,c] of CELLS.entries()){
    if(!files.includes(dispatchName(i))){
     if(files.includes(cellName(i))||CELLS.slice(i+1).some((_,j)=>files.includes(cellName(i+j+1))||files.includes(dispatchName(i+j+1))))throw Error('Unverified cell sequence');break;
    }
    const d=read(workspace,dispatchName(i)),expected={schema:'MANA_FORMAT_BENCH_DISPATCH_V1',binding,index:i,task:c.task.id,format:c.format};
    if(digest(d)!==digest(expected)||results.some(y=>INPUT_STOP.has(y.transport)))throw Error('Unverified dispatch');
    if(!files.includes(cellName(i))){
     if(CELLS.slice(i+1).some((_,j)=>files.includes(cellName(i+j+1))||files.includes(dispatchName(i+j+1))))throw Error('Unverified later dispatch');
     pending={task:c.task.id,format:c.format};break;
    }
    const x=read(workspace,cellName(i));if(x.binding!==binding||x.index!==i||x.resultHash!==digest(x.result)||!validResult(x.result,i))throw Error('Unverified cell');results.push(x.result);
   }
   if(!files.includes('receipt.json'))return answer('UNKNOWN_OUTCOME',true);
   const r=read(workspace,'receipt.json'),status=results.some(x=>INPUT_STOP.has(x.transport))?'TRANSPORT_STOPPED':results.length===6?'COMPLETE':null;
   if(pending||!status||r.schema!=='MANA_FORMAT_BENCH_RECEIPT_V1'||r.binding!==binding||r.status!==status||r.claimHash!==digest(claim)||r.resultsHash!==digest(results))throw Error('Unverified aggregate receipt');
   return answer(status,true);
  }catch{return answer('UNKNOWN_OUTCOME',true);}
 }
 if(readOnly)return answer('NOT_STARTED',true);
 const claim={schema:'MANA_FORMAT_BENCH_CLAIM_V1',binding,budget:6,nonce:crypto.randomUUID(),startedAt:new Date().toISOString()};
 try{
  check();write(workspace,'claim.json',claim);
  for(const [i,c]of CELLS.entries()){
   check();if(digest(read(workspace,'claim.json'))!==digest(claim))throw Error('Claim changed');
   write(workspace,dispatchName(i),{schema:'MANA_FORMAT_BENCH_DISPATCH_V1',binding,index:i,task:c.task.id,format:c.format});
   pending={task:c.task.id,format:c.format};
   check();if(digest(read(workspace,'claim.json'))!==digest(claim))throw Error('Claim changed');
   sent++;const local=await complete({model,task:c.task,format:c.format,port,timeoutMs});
   check();if(digest(read(workspace,'claim.json'))!==digest(claim))throw Error('Claim changed');
   const result=local.kind==='RESPONSE'?assess(c.task,c.format,local.text):emptyOutcome(c,local.kind);
   write(workspace,cellName(i),{binding,index:i,resultHash:digest(result),result});results.push(result);pending=null;
   if(INPUT_STOP.has(local.kind))break;
  }
  const status=results.some(x=>INPUT_STOP.has(x.transport))?'TRANSPORT_STOPPED':'COMPLETE';
  write(workspace,'receipt.json',{schema:'MANA_FORMAT_BENCH_RECEIPT_V1',binding,status,claimHash:digest(claim),resultsHash:digest(results)});
  return answer(status);
 }catch{return answer('UNKNOWN_OUTCOME');}
}
if(require.main===module){
 const args=process.argv.slice(2),readOnly=args[0]==='--read-only';if(readOnly)args.shift();const [workspace,...extra]=args;
 if(Number(process.versions.node.split('.')[0])<24||!workspace||extra.length){console.error('Usage: MANA_CONVERSATION_MODEL_ID=<configured-local-model> node mana-format-bench.cjs [--read-only] /absolute/private/workspace (Node 24+)');process.exitCode=1;}
 else benchmark({workspace,model:process.env.MANA_CONVERSATION_MODEL_ID,readOnly}).then(r=>{console.log(JSON.stringify(r));if(r.status!=='COMPLETE')process.exitCode=2;}).catch(e=>{console.error(JSON.stringify({status:'BLOCKED',error:e.message}));process.exitCode=1;});
}
module.exports={benchmark,decode,grammar};
