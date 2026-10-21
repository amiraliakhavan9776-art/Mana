'use strict';
const crypto=require('node:crypto');
const ID=/^[A-Za-z0-9_-]{1,100}$/;
function passwordRecord(password){
 if(typeof password!=='string'||password.length<12||password.length>256)throw Error('Password length must be 12-256');
 const salt=crypto.randomBytes(16);
 return {salt:salt.toString('hex'),digest:crypto.scryptSync(password,salt,32).toString('hex')};
}
function createSessionAuth({accounts=[],now=()=>Date.now(),ttlMs=3600000}={}){
 const users=new Map(),sessions=new Map();
 if(!Number.isSafeInteger(ttlMs)||ttlMs<60000||ttlMs>86400000)throw Error('Invalid TTL');
 for(const a of accounts){
  if(!ID.test(a.userId)||!ID.test(a.organizationId)||!/^[a-f0-9]{32}$/.test(a.salt)||!/^[a-f0-9]{64}$/.test(a.digest)||users.has(a.userId))throw Error('Invalid account');
  users.set(a.userId,a);
 }
 function login(userId,password){
  if(typeof userId!=='string'||typeof password!=='string'||password.length>256)return null;
  const a=users.get(userId);
  const salt=Buffer.from(a?a.salt:'0'.repeat(32),'hex');
  const expected=Buffer.from(a?a.digest:'0'.repeat(64),'hex');
  const actual=crypto.scryptSync(password,salt,32);
  if(!a||!crypto.timingSafeEqual(expected,actual))return null;
  const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex');
  sessions.set(token,{userId:a.userId,organizationId:a.organizationId,csrf,expires:now()+ttlMs});
  return {token,csrf,expiresAt:now()+ttlMs};
 }
 function authenticate(req){
  const m=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'');
  if(!m)return null;
  const s=sessions.get(m[1]);if(!s)return null;
  if(s.expires<=now()){sessions.delete(m[1]);return null}
  return {userId:s.userId,organizationId:s.organizationId,canReadConversations:true,canWriteConversations:true,
   verifyCsrf:proof=>typeof proof==='string'&&/^[a-f0-9]{64}$/.test(proof)&&crypto.timingSafeEqual(Buffer.from(proof,'hex'),Buffer.from(s.csrf,'hex'))};
 }
 function revoke(token){sessions.delete(token)}
 return {login,authenticate,revoke};
}
module.exports={passwordRecord,createSessionAuth};
