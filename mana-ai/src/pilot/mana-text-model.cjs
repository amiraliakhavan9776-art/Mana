'use strict';
// Optional local TEXT adapter. Nothing in an answer is executed, even if it
// looks like an instruction, tool call or receipt. No state is saved here.
const http=require('node:http');

const MAX_TEXT_BYTES=2000, MAX_HISTORY_BYTES=10000, MAX_HISTORY_ITEMS=8;
const MAX_RESPONSE_BYTES=32768, MAX_ANSWER_BYTES=8000;
const SYSTEM='Answer in the user’s language; use Persian for Persian questions. You only produce conversation text. You cannot access projects, files, the web or tools, execute or approve actions, or verify live facts. Do not claim you have done any of those things. Use up to three short sentences. Say when you are uncertain.';
const unavailable=reason=>({status:'TEXT_MODEL_UNAVAILABLE',reason});
const plain=x=>x!==null&&typeof x==='object'&&Object.getPrototypeOf(x)===Object.prototype;
function textOk(text,limit){
 return typeof text==='string'&&text.trim().length>0&&Buffer.byteLength(text)<=limit
   &&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(text);
}
function createManaTextModel(options={}){return createBoundedLocalCompletion(options,SYSTEM);}
function createBoundedLocalCompletion(options,system,grammar){
 if(!plain(options)||Object.keys(options).some(k=>!['port','model','timeoutMs'].includes(k)))throw Error('Explicit bounded local text model configuration required');
 const {port,model,timeoutMs=30000}=options;
 if(!Number.isInteger(port)||port<1||port>65535||
  typeof model!=='string'||!/^[A-Za-z0-9._:/-]{1,100}$/.test(model)||
  model.includes('://')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error('Explicit bounded local text model configuration required');
 return async function answerText(input){
  if(!plain(input)||Object.keys(input).some(k=>k!=='text'&&k!=='history')||!textOk(input.text,MAX_TEXT_BYTES))return unavailable('INVALID_INPUT');
  const history=input.history===undefined?[]:input.history;
  if(!Array.isArray(history)||history.length>MAX_HISTORY_ITEMS)return unavailable('INVALID_INPUT');
  const messages=[{role:'system',content:system}];let historyBytes=0;
  for(const item of history){
   if(!plain(item)||Object.keys(item).length!==2||!Object.hasOwn(item,'role')||!Object.hasOwn(item,'text')||
    !['user','assistant'].includes(item.role)||!textOk(item.text,item.role==='user'?MAX_TEXT_BYTES:MAX_ANSWER_BYTES))return unavailable('INVALID_INPUT');
   historyBytes+=Buffer.byteLength(item.text);
   if(historyBytes>MAX_HISTORY_BYTES)return unavailable('INVALID_INPUT');
   messages.push({role:item.role,content:item.text});
  }
  messages.push({role:'user',content:input.text});
  const payload=Buffer.from(JSON.stringify({model,messages,stream:false,temperature:.2,max_tokens:128,...(grammar?{grammar}:{})}));
  return new Promise(resolve=>{
   let req,timer,done=false;
   function finish(result){
    if(done)return;
    done=true;clearTimeout(timer);resolve(result);
   }
   function stop(reason){
    finish(unavailable(reason));req?.destroy();
   }
   try{
    req=http.request({hostname:'127.0.0.1',family:4,port,path:'/v1/chat/completions',method:'POST',agent:false,maxHeaderSize:8192,
     headers:{'Content-Type':'application/json','Content-Length':payload.length,'Accept':'application/json','Accept-Encoding':'identity'}},res=>{
     if(res.statusCode!==200)return stop('HTTP_STATUS');
     if(!/^application\/json(?:\s*;.*)?$/i.test(res.headers['content-type']||'')||
       (res.headers['content-encoding']!==undefined&&res.headers['content-encoding']!=='identity'))return stop('INVALID_RESPONSE');
     if(Number(res.headers['content-length'])>MAX_RESPONSE_BYTES)return stop('RESPONSE_TOO_LARGE');
     const chunks=[];let size=0;
     res.on('data',chunk=>{
      if(done)return;
      size+=chunk.length;
      if(size>MAX_RESPONSE_BYTES)return stop('RESPONSE_TOO_LARGE');
      chunks.push(chunk);
     });
     res.once('aborted',()=>stop('TRANSPORT'));
     res.once('error',()=>stop('TRANSPORT'));
     res.once('end',()=>{
      if(done)return;
      try{
       const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size));
       const body=JSON.parse(raw);
       if(!plain(body)||!Array.isArray(body.choices)||body.choices.length!==1)throw Error('Invalid response');
       const choice=body.choices[0], message=choice?.message;
       if(!plain(choice)||!plain(message)||(message.role!==undefined&&message.role!=='assistant')||
        (choice.finish_reason!==undefined&&choice.finish_reason!=='stop')||
        (message.tool_calls!=null&&(!Array.isArray(message.tool_calls)||message.tool_calls.length!==0))||
        message.function_call!=null||!textOk(message.content,MAX_ANSWER_BYTES))throw Error('Invalid text response');
       finish({status:'TEXT_ANSWER',text:message.content.trim()});
      }catch{stop('INVALID_RESPONSE');}
     });
    });
    req.once('error',()=>stop('TRANSPORT'));
    timer=setTimeout(()=>stop('TIMEOUT'),timeoutMs);
    req.end(payload);
   }catch{stop('TRANSPORT');}
  });
 };
}
module.exports={createManaTextModel,createBoundedLocalCompletion};
