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
function proposeLocal({instruction,fields,feedback,port=8794,timeoutMs=120000,systemPrompt=null,maxTokens=1800,responseLimit=32768,contentLimit=16000}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000||!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
 const payload=JSON.stringify({messages:[{role:'system',content:systemPrompt??'Return ONLY a JSON expression, no markdown or JavaScript. Nodes: {"field":"name"}, {"value":number_or_boolean}, {"op":"add|subtract|multiply|divide|min|max|less|equal","args":[node,node]}, {"op":"if","args":[boolean_node,node,node]}. Maximum depth 12, 128 nodes. No other operations. This is approximate nonfinancial numeric arithmetic.'},{role:'user',content:JSON.stringify({instruction,fields,feedback})}],temperature:0.1,max_tokens:maxTokens});
 return new Promise((resolve,reject)=>{let size=0,chunks=[];const timer=setTimeout(()=>req.destroy(Error('Local model deadline')),timeoutMs);
  const req=http.request({host:'127.0.0.1',port,path:'/v1/chat/completions',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},res=>{
   res.on('error',reject);res.on('data',chunk=>{size+=chunk.length;if(size>responseLimit)req.destroy(Error('Model response too large'));else chunks.push(chunk);});
   res.on('end',()=>{try{if(res.statusCode!==200)throw Error('Local model unavailable');const body=parseExactJSON(Buffer.concat(chunks).toString('utf8'));const content=body.choices?.[0]?.message?.content;if(typeof content!=='string'||Buffer.byteLength(content)>contentLimit)throw Error('Invalid model content');resolve(content);}catch(e){reject(e);}});
  });req.on('error',reject);req.on('close',()=>clearTimeout(timer));req.end(payload);
 });
}
function readRegular(file,max){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const st=fs.fstatSync(fd);if(!st.isFile()||st.size>max)throw Error('Bounded regular file required');return fs.readFileSync(fd,'utf8');}finally{fs.closeSync(fd);}}
async function evolveSkill({task,workspace,propose=proposeLocal,maxAttempts=3}){
 validateTask(task);if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5||!path.isAbsolute(workspace))throw Error('Invalid evolution budget/workspace');
 fs.mkdirSync(workspace,{recursive:true,mode:0o700});const st=fs.lstatSync(workspace);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))throw Error('Private workspace required');
 const engineHash=hash(fs.readFileSync(__filename)+fs.readFileSync(require.resolve('./skill-expression.cjs'))+fs.readFileSync(require.resolve('../exact-json.cjs'))),taskHash=hash(JSON.stringify({task,engineHash})),dir=path.join(workspace,task.id+'-'+taskHash.slice(0,16));fs.mkdirSync(dir,{recursive:true,mode:0o700});if(fs.lstatSync(dir).isSymbolicLink())throw Error('Symlink denied');
 const lock=path.join(dir,'lock');fs.mkdirSync(lock,{mode:0o700});
 const save=(name,value)=>{const bytes=JSON.stringify(value,null,2)+'\n',tmp=path.join(dir,'.'+crypto.randomUUID());const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.linkSync(tmp,path.join(dir,name));fs.unlinkSync(tmp);const d=fs.openSync(dir,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}};
 try{
  const reports=[];let feedback='No candidate evaluated';
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   const name='attempt-'+attempt+'.json',file=path.join(dir,name);
   if(fs.existsSync(file)){
    const old=parseExactJSON(readRegular(file,64000));if(old.taskHash!==taskHash||old.attempt!==attempt)throw Error('Checkpoint mismatch');
    if(old.status==='BENCHMARK_PASSED_AWAITING_REVIEW'){
     if(hash(JSON.stringify(old.expression))!==old.candidateHash||!benchmark(old.expression,task).every(x=>x.pass))throw Error('Checkpoint evidence invalid');
     return {...old,approved:false,productionDeploymentAllowed:false,resumed:true,directory:dir};
    }reports.push(old);feedback='Previous candidate did not pass all independent tests.';continue;
   }
   let source;
   try{source=await propose({instruction:task.instruction,fields:task.fields,feedback});}catch{
    // Provider absence never consumes an attempt or substitutes generated success.
    return {status:'DEPENDENCY_UNAVAILABLE',taskHash,attempt,directory:dir,approved:false,productionDeploymentAllowed:false};
   }
   let expression=null,results=[],candidateHash=null,status='CANDIDATE_REJECTED';
   try{if(typeof source!=='string'||Buffer.byteLength(source)>16000)throw Error('Candidate bound');expression=parseExactJSON(source);validateExpression(expression,task.fields);candidateHash=hash(JSON.stringify(expression));results=benchmark(expression,task);if(results.every(x=>x.pass))status='BENCHMARK_PASSED_AWAITING_REVIEW';}catch{expression=null;}
   const report={schema:'MANA_SKILL_CANDIDATE_V1',taskId:task.id,taskHash,engineHash,attempt,status,expression,candidateHash,results,total:task.tests.length,passed:results.filter(x=>x.pass).length,approved:false,productionDeploymentAllowed:false};
   save(name,report);reports.push(report);
   if(status==='BENCHMARK_PASSED_AWAITING_REVIEW')return {...report,directory:dir,resumed:false};
   feedback='Previous candidate failed validation or independent tests. Reconsider the instruction. Tests and expected answers are not disclosed.';
  }
  return {status:'BUDGET_EXHAUSTED',taskHash,attempts:reports.length,directory:dir,approved:false,productionDeploymentAllowed:false};
 }finally{fs.rmdirSync(lock);}
}
function benchmark(expression,task){return task.tests.map((test,index)=>{try{return {index,pass:evaluateExpression(expression,test.input,task.fields)===test.expected};}catch{return {index,pass:false};}});}
module.exports={validateTask,evolveSkill,proposeLocal,readRegular};
