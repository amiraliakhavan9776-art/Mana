'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {createEncryptedState}=require('../encrypted-state.cjs');
const KINDS=new Set(['goal','preference','commitment','decision','note']);
function ownerScope(owner){if(!owner||!['id','realm'].every(k=>typeof owner[k]==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(owner[k])))throw Error('Invalid personal owner');return createHash('sha256').update(JSON.stringify([owner.realm,owner.id])).digest('hex')}
function createPersonalMemory({file,key,owner,authorize,now=Date.now,maxRecords=100}={}){
 const scope=ownerScope(owner),identity=Object.freeze({id:owner.id,realm:owner.realm});
 if(typeof authorize!=='function'||typeof now!=='function'||!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>1000)throw Error('Invalid personal memory configuration');
 const store=createEncryptedState({file,key,kind:'MANA_JARVIS_PERSONAL_V1:'+scope});
 function check(subject,op){if(subject?.id!==identity.id||subject?.realm!==identity.realm||authorize(subject,'jarvis.memory.'+op)!==true)throw Error('Personal memory access denied')}
 function time(){const n=now();if(!Number.isSafeInteger(n)||n<0||n>Number.MAX_SAFE_INTEGER-31536000000)throw Error('Invalid personal clock');return n}
 function state(raw){if(raw===null)return {version:1,records:[]};if(raw.version!==1||!Array.isArray(raw.records))throw Error('Invalid personal memory');return raw}
 function valid({kind,text,retentionMs,consent}){if(consent!==true)throw Error('Explicit personal memory consent required');if(!KINDS.has(kind)||typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>4096||!Number.isSafeInteger(retentionMs)||retentionMs<60000||retentionMs>31536000000)throw Error('Invalid personal memory entry')}
 return Object.freeze({
  remember({subject,kind,text,retentionMs,consent}){check(subject,'write');valid({kind,text,retentionMs,consent});return store.transact(raw=>{const s=state(raw),at=time();s.records=s.records.filter(r=>r.expiresAt>at);if(s.records.length>=maxRecords)throw Error('Personal memory capacity reached');const record={id:randomUUID(),revision:1,kind,text,createdAt:at,updatedAt:at,expiresAt:at+retentionMs,classification:'user_statement',consent:{actorId:identity.id,grantedAt:at}};s.records.push(record);return {write:true,state:s,result:{...record}}})},
  recall({subject,query=''}){check(subject,'read');if(typeof query!=='string'||query.length>200)throw Error('Invalid memory query');return store.transact(raw=>({result:state(raw).records.filter(r=>r.expiresAt>time()&&r.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()))}))},
  correct({subject,id,expectedRevision,kind,text,retentionMs,consent}){check(subject,'write');valid({kind,text,retentionMs,consent});return store.transact(raw=>{const s=state(raw),r=s.records.find(r=>r.id===id&&r.expiresAt>time());if(!r||r.revision!==expectedRevision)throw Error('Personal memory revision conflict');const at=time();Object.assign(r,{kind,text,revision:r.revision+1,updatedAt:at,expiresAt:at+retentionMs,consent:{actorId:identity.id,grantedAt:at}});return {write:true,state:s,result:{...r}}})},
  forget({subject,id,expectedRevision}){check(subject,'delete');return store.transact(raw=>{const s=state(raw),r=s.records.find(r=>r.id===id);if(!r||r.revision!==expectedRevision)throw Error('Personal memory revision conflict');s.records=s.records.filter(x=>x.id!==id);return {write:true,state:s,result:{removed:1}}})},
  purgeExpired({subject}){check(subject,'delete');return store.transact(raw=>{const s=state(raw),at=time(),before=s.records.length;s.records=s.records.filter(r=>r.expiresAt>at);return {write:true,state:s,result:{removed:before-s.records.length}}})}
 });
}
module.exports={ownerScope,createPersonalMemory};
