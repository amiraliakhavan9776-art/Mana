'use strict';
const {randomBytes,timingSafeEqual}=require('node:crypto');
const MAX_MESSAGES=40;
function createMobileSessions({ttlMs=30*60*1000,clock=()=>Date.now()}={}){
 if(!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>24*60*60*1000)throw Error('Invalid session TTL');
 const sessions=new Map();
 function verify(token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;
  // Uniform comparison for matching stored tokens.
  for(const [key,session] of sessions){
   if(timingSafeEqual(Buffer.from(key,'hex'),Buffer.from(token,'hex'))){
    if(session.expiresAt<=clock()){sessions.delete(key);return null}
    return session;
   }
  }
  return null;
 }
 return {
  create({userId,organizationId}){
   if(typeof userId!=='string'||!userId.trim()||userId.length>120||typeof organizationId!=='string'||!organizationId.trim()||organizationId.length>120)throw Error('Invalid identity');
   const token=randomBytes(32).toString('hex');
   sessions.set(token,{userId,organizationId,expiresAt:clock()+ttlMs,messages:[]});
   return token;
  },
  identity(token){
   const s=verify(token);return s?{userId:s.userId,organizationId:s.organizationId,expiresAt:s.expiresAt}:null;
  },
  append(token,{role,text}){
   const s=verify(token);if(!s)throw Error('Unauthorized or expired');
   if(!['user','assistant'].includes(role)||typeof text!=='string'||!text.trim()||text.length>4000)throw Error('Invalid message');
   s.messages.push({role,text});if(s.messages.length>MAX_MESSAGES)s.messages.splice(0,s.messages.length-MAX_MESSAGES);
  },
  history(token){
   const s=verify(token);if(!s)throw Error('Unauthorized or expired');
   return s.messages.map(m=>({...m}));
  },
  revoke(token){if(typeof token==='string')sessions.delete(token)},
  cleanup(){for(const [key,s] of sessions)if(s.expiresAt<=clock())sessions.delete(key)}
 };
}
module.exports={createMobileSessions};
