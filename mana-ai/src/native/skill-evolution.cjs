'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const {parseExactJSON}=require('../exact-json.cjs');
const {validateExpression,evaluateExpression}=require('./skill-expression.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const exact=(x,fields)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===fields.sort().join(',');
function validateTask(t){
 if(!exact(t,['schema','id','instruction','fields','tests'])||t.schema!=='MANA_SKILL_TASK_V1'||typeof t.id!=='string'||!/^[a-z][a-z0-9_-]{0,59}$/.test(t.id)||typeof t.instruction!=='string'||t.instruction.length<10||t.instruction.length>3000)throw Error('Invalid task');
 validateExpression({value:0},t.fields);
 if(!Array.isArray(t.tests)||t.tests.length<3||t.tests.length>100)throw Error('Independent tests required');
 for(const test of t.tests){if(!exact(test,['input','expected'])||!exact(test.input,t.fields))throw Error('Invalid test');evaluateExpression({value:test.expected},test.input,t.fields);}
 return t;
}
function providerError(code){const error=Error(code);error.code=code;error.stage='transport';return error;}
// The HTTP envelope is ordinary JSON; only the embedded DSL uses exact-number JSON.
function parseModelEnvelope(text,{responseLimit=32768,contentLimit=16000}={}){
 if(!Number.isInteger(responseLimit)||responseLimit<1||responseLimit>1048576||!Number.isInteger(contentLimit)||contentLimit<1||contentLimit>1048576)throw providerError('TRANSPORT_CONFIGURATION_INVALID');
 if(typeof text!=='string'||Buffer.byteLength(text)>responseLimit)throw providerError('TRANSPORT_RESPONSE_TOO_LARGE');
 let body;try{body=JSON.parse(text);}catch{throw providerError('TRANSPORT_ENVELOPE_INVALID');}
 const stack=[];
 for(const [token] of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\],:]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)){
  const top=stack.at(-1);
  if(token==='{'||token==='['){stack.push({keys:token==='{'?new Set():null,expectKey:true});if(stack.length>32)throw providerError('TRANSPORT_ENVELOPE_DEPTH');}
  else if(token==='}'||token===']')stack.pop();
  else if(token===','&&top?.keys)top.expectKey=true;
  else if(token===':'&&top?.keys)top.expectKey=false;
  else if(token[0]==='"'&&top?.keys&&top.expectKey){const key=JSON.parse(token);if(top.keys.has(key))throw providerError('TRANSPORT_DUPLICATE_KEY');top.keys.add(key);}
  else if(/^-?\d/.test(token)&&!Number.isFinite(Number(token)))throw providerError('TRANSPORT_ENVELOPE_INVALID');
 }
 if(!body||Array.isArray(body)||typeof body!=='object'||!Array.isArray(body.choices)||body.choices.length!==1)throw providerError('TRANSPORT_ENVELOPE_INVALID');
 const choice=body.choices[0],message=choice?.message;
 if(!choice||Array.isArray(choice)||typeof choice!=='object'||choice.index!==undefined&&choice.index!==0||!message||Array.isArray(message)||typeof message!=='object'||message.role!==undefined&&message.role!=='assistant')throw providerError('TRANSPORT_ENVELOPE_INVALID');
 if(choice.finish_reason!==undefined&&choice.finish_reason!=='stop'||message.tool_calls?.length||message.function_call)throw providerError('TRANSPORT_RESPONSE_INCOMPLETE');
 if(typeof message.content!=='string'||Buffer.byteLength(message.content)>contentLimit)throw providerError('TRANSPORT_CONTENT_INVALID');
 return message.content;
}
function proposeLocal({instruction,fields,feedback,port,timeoutMs=120000,systemPrompt=null,model=null,maxTokens=1800,responseLimit=32768,contentLimit=16000,constraint,dimensionGrammarOptions}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000||!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
 if(model!==null&&(typeof model!=='string'||!model.trim()||model.length>300))throw Error('Explicit model identifier required');
 if(!Number.isInteger(responseLimit)||responseLimit<1||responseLimit>1048576||!Number.isInteger(contentLimit)||contentLimit<1||contentLimit>1048576)throw providerError('TRANSPORT_CONFIGURATION_INVALID');
 let grammar;
 if(constraint==='llama-dimension-gbnf-v1'){
  if(!dimensionGrammarOptions||!exact(dimensionGrammarOptions,['expectedPower']))throw providerError('TRANSPORT_CONFIGURATION_INVALID');
  try{grammar=require('./skill-grammar.cjs').buildDimensionSkillGrammar(fields,dimensionGrammarOptions);}catch{throw providerError('TRANSPORT_CONFIGURATION_INVALID');}
 }else{
  if(dimensionGrammarOptions!==undefined||constraint!==undefined&&constraint!=='llama-gbnf-v1')throw providerError('TRANSPORT_CONFIGURATION_INVALID');
  if(constraint==='llama-gbnf-v1')grammar=require('./skill-grammar.cjs').buildSkillGrammar(fields);
 }
 const typedSystem=constraint==='llama-dimension-gbnf-v1'?'Return exactly one numeric DSL expression meeting the stated units. A leaf is {"field":"allowed_name"} or {"value":integer}. A binary node is {"op":"allowed_operator","args":[node,node]}. Use the required inputs meaningfully. Do not output prose, code fences, or a bare value that cannot meet the required units.':null;
 const payload=JSON.stringify({...(grammar===undefined?{}:{grammar}),...(model===null?{}:{model}),messages:[{role:'system',content:systemPrompt??typedSystem??'Return ONLY a JSON expression, no markdown or JavaScript. Nodes: {"field":"name"}, {"value":number_or_boolean}, {"op":"add|subtract|multiply|divide|min|max|less|equal","args":[node,node]}, {"op":"if","args":[boolean_node,node,node]}. Maximum depth 12, 128 nodes. No other operations. This is approximate nonfinancial numeric arithmetic.'},{role:'user',content:JSON.stringify({instruction,fields,feedback})}],temperature:0.1,max_tokens:maxTokens});
 return new Promise((resolve,reject)=>{let size=0,chunks=[];const timer=setTimeout(()=>{reject(providerError('TRANSPORT_TIMEOUT'));req.destroy();},timeoutMs);
  const req=http.request({host:'127.0.0.1',port,path:'/v1/chat/completions',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},res=>{
   res.on('error',()=>reject(providerError('TRANSPORT_NETWORK_ERROR')));res.on('data',chunk=>{size+=chunk.length;if(size>responseLimit){reject(providerError('TRANSPORT_RESPONSE_TOO_LARGE'));req.destroy();}else chunks.push(chunk);});
   res.on('end',()=>{try{if(res.statusCode!==200){const error=providerError('TRANSPORT_HTTP_ERROR');error.httpStatus=res.statusCode;throw error;}let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}catch{throw providerError('TRANSPORT_UTF8_INVALID');}const content=parseModelEnvelope(text,{responseLimit,contentLimit});resolve(content);}catch(e){reject(e);}});
  });req.on('error',()=>reject(providerError('TRANSPORT_NETWORK_ERROR')));req.on('close',()=>clearTimeout(timer));req.end(payload);
 });
}
function readRegular(file,max){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const st=fs.fstatSync(fd);if(!st.isFile()||st.size>max)throw Error('Bounded regular file required');return fs.readFileSync(fd,'utf8');}finally{fs.closeSync(fd);}}
function screenCandidate(check,expression,fields){
 if(check===undefined)return null;
 const out=check(structuredClone(expression));
 if(!out||typeof out.ok!=='boolean'||typeof out.code!=='string'||!/^[A-Z][A-Z0-9_]{1,63}$/.test(out.code))throw Error('Invalid candidate screen receipt');
 const result={ok:out.ok,code:out.code};
 for(const name of ['actualPower','expectedPower'])if(Number.isInteger(out[name])&&Math.abs(out[name])<=128)result[name]=out[name];
 if(Array.isArray(out.missingFields)&&out.missingFields.length<=fields.length&&out.missingFields.every(x=>fields.includes(x)))result.missingFields=[...out.missingFields];
 return result;
}
async function evolveSkill({task,workspace,propose=proposeLocal,maxAttempts=3,candidateCheck,candidatePolicyId,initialFeedback='No candidate evaluated'}){
 validateTask(task);if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5||!path.isAbsolute(workspace))throw Error('Invalid evolution budget/workspace');
 fs.mkdirSync(workspace,{recursive:true,mode:0o700});const st=fs.lstatSync(workspace);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))throw Error('Private workspace required');
 if((candidateCheck===undefined)!==(candidatePolicyId===undefined)||candidateCheck!==undefined&&(typeof candidateCheck!=='function'||typeof candidatePolicyId!=='string'||!/^[a-z0-9][a-z0-9_-]{0,95}$/.test(candidatePolicyId))||typeof initialFeedback!=='string'||Buffer.byteLength(initialFeedback)>1024)throw Error('Invalid candidate screen policy or feedback');
 const engineHash=hash(fs.readFileSync(__filename)+fs.readFileSync(require.resolve('./skill-expression.cjs'))+fs.readFileSync(require.resolve('../exact-json.cjs'))),taskHash=hash(JSON.stringify({task,engineHash,...(candidateCheck===undefined?{}:{candidatePolicyId})})),dir=path.join(workspace,task.id+'-'+taskHash.slice(0,16));fs.mkdirSync(dir,{recursive:true,mode:0o700});if(fs.lstatSync(dir).isSymbolicLink())throw Error('Symlink denied');
 const lock=path.join(dir,'lock');fs.mkdirSync(lock,{mode:0o700});
 const save=(name,value)=>{const bytes=JSON.stringify(value,null,2)+'\n',tmp=path.join(dir,'.'+crypto.randomUUID());const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.linkSync(tmp,path.join(dir,name));fs.unlinkSync(tmp);const d=fs.openSync(dir,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}};
 try{
  const reports=[];let feedback=initialFeedback;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   const name='attempt-'+attempt+'.json',file=path.join(dir,name);
   if(fs.existsSync(file)){
    const old=parseExactJSON(readRegular(file,64000));if(old.taskHash!==taskHash||old.attempt!==attempt)throw Error('Checkpoint mismatch');
    if(old.status==='BENCHMARK_PASSED_AWAITING_REVIEW'){
     if(hash(JSON.stringify(old.expression))!==old.candidateHash||screenCandidate(candidateCheck,old.expression,task.fields)?.ok===false||!benchmark(old.expression,task).every(x=>x.pass))throw Error('Checkpoint evidence invalid');
     return {...old,approved:false,productionDeploymentAllowed:false,resumed:true,directory:dir};
    }reports.push(old);feedback='Previous candidate did not pass all independent tests.';continue;
   }
   let source;
   try{source=await propose({instruction:task.instruction,fields:task.fields,feedback});}catch(error){
    // Provider absence never consumes an attempt or substitutes generated success.
    return {status:'DEPENDENCY_UNAVAILABLE',outcome:{stage:'transport',code:error?.stage==='transport'&&/^TRANSPORT_[A-Z_]+$/.test(error.code)?error.code:'TRANSPORT_UNAVAILABLE',...(Number.isInteger(error?.httpStatus)&&error.httpStatus>=100&&error.httpStatus<=599?{httpStatus:error.httpStatus}:{})},taskHash,attempt,directory:dir,approved:false,productionDeploymentAllowed:false};
   }
   let expression=null,results=[],candidateHash=null,screen=null,status='CANDIDATE_REJECTED',parsed=false,outcome={stage:'proposal',code:'PROPOSAL_JSON_INVALID'};
   try{if(typeof source!=='string'||Buffer.byteLength(source)>16000)throw Error('Candidate bound');expression=parseExactJSON(source);parsed=true;}catch{expression=null;}
   if(parsed){
    try{validateExpression(expression,task.fields);}catch{expression=null;outcome={stage:'proposal',code:'PROPOSAL_GRAMMAR_INVALID'};}
    if(expression!==null){
     candidateHash=hash(JSON.stringify(expression));screen=screenCandidate(candidateCheck,expression,task.fields);
     if(screen?.ok===false){outcome={stage:'dimension',code:screen.code};}
     else{results=benchmark(expression,task);const passed=results.every(x=>x.pass);outcome={stage:'benchmark',code:passed?'BENCHMARK_PASSED':'BENCHMARK_FAILED'};if(passed)status='BENCHMARK_PASSED_AWAITING_REVIEW';}
    }
   }
   const report={schema:'MANA_SKILL_CANDIDATE_V1',taskId:task.id,taskHash,engineHash,attempt,status,outcome,...(screen?{screen}:{}),expression,candidateHash,results,total:task.tests.length,passed:results.filter(x=>x.pass).length,approved:false,productionDeploymentAllowed:false};
   save(name,report);reports.push(report);
   if(status==='BENCHMARK_PASSED_AWAITING_REVIEW')return {...report,directory:dir,resumed:false};
   feedback='Previous candidate failed validation or independent tests. Reconsider the instruction. Tests and expected answers are not disclosed.';
  }
  return {status:'BUDGET_EXHAUSTED',lastOutcome:reports.at(-1)?.outcome??null,...(candidateCheck===undefined?{}:{lastScreen:reports.at(-1)?.screen??null,testsRun:reports.at(-1)?.results.length??0,passed:reports.at(-1)?.passed??0,total:task.tests.length}),taskHash,attempts:reports.length,directory:dir,approved:false,productionDeploymentAllowed:false};
 }finally{fs.rmdirSync(lock);}
}
function benchmark(expression,task){return task.tests.map((test,index)=>{try{return {index,pass:evaluateExpression(expression,test.input,task.fields)===test.expected};}catch{return {index,pass:false};}});}
module.exports={validateTask,evolveSkill,proposeLocal,parseModelEnvelope,readRegular};
