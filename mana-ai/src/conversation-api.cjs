'use strict';
const {randomUUID}=require('node:crypto');
const ID=/^[a-zA-Z0-9_-]{1,100}$/;
const MAX_BODY=6000;
function createConversationApi({store,authenticate}={}){
 if(!store||typeof store.read!=='function'||typeof store.append!=='function')throw Error('Conversation store required');
 if(typeof authenticate!=='function')throw Error('Trusted authenticator required');
 return async function handle(req,res){
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(!pathname.startsWith('/api/conversations'))return false;
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
  // No identity accepted from request JSON, URL parameters or unverified headers.
  let principal;
  try{principal=await authenticate(req)}catch{return reply(401,{error:'Unauthorized'}),true}
  if(!principal||!ID.test(principal.userId)||!ID.test(principal.organizationId)||principal.canReadConversations!==true){
   reply(403,{error:'Forbidden'});return true;
  }
  const parts=pathname.split('/').filter(Boolean);
  if(parts.length!==3||parts[0]!=='api'||parts[1]!=='conversations'||!ID.test(parts[2])){
   reply(404,{error:'Not found'});return true;
  }
  const scope={organizationId:principal.organizationId,userId:principal.userId,conversationId:parts[2]};
  if(req.method==='GET'){
   try{reply(200,{conversationId:parts[2],messages:await store.read(scope)})}
   catch{reply(500,{error:'Conversation unavailable'})}
   return true;
  }
  if(req.method!=='POST'){reply(405,{error:'Method not allowed'});return true}
  if(principal.canWriteConversations!==true){reply(403,{error:'Forbidden'});return true}
  if(req.headers['content-type']?.split(';')[0]!=='application/json'){reply(415,{error:'Expected JSON'});return true}
  // CSRF protection: browsers must present a valid server-issued anti-CSRF proof.
  if(typeof principal.verifyCsrf!=='function'||!principal.verifyCsrf(req.headers['x-mana-csrf'])){reply(403,{error:'CSRF validation failed'});return true}
  try{
   let size=0,chunks=[];
   for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw Error('Too large');chunks.push(chunk)}
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!body||body.role!=='user'||typeof body.text!=='string'||!body.text.trim()||body.text.length>4000){reply(400,{error:'Invalid message'});return true}
   await store.append(scope,{role:'user',text:body.text});
   reply(201,{ok:true,conversationId:parts[2]});
  }catch{reply(400,{error:'Invalid request or storage unavailable'})}
  return true;
 };
}
module.exports={createConversationApi};
