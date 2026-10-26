'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createEncryptedState}=require('./encrypted-state.cjs');
function valid(value){return value&&Number.isSafeInteger(value.sequence)&&value.sequence>=0&&typeof value.hash==='string'&&/^[a-f0-9]{64}$/.test(value.hash)}
function createFileAuditAnchor({file,key,auditId}){
 if(typeof auditId!=='string'||!auditId||auditId.length>1024)throw Error('Stable audit identity required');
 const store=createEncryptedState({file,key,kind:'MANA_AUDIT_ANCHOR_V1:'+auditId});
 return Object.freeze({
  read(){return store.transact(state=>{if(state!==null&&!valid(state))throw Error('Invalid anchor state');return {result:state===null?null:{...state}}})},
  write(checkpoint){
   if(!valid(checkpoint))throw Error('Invalid audit checkpoint');
   return store.transact(state=>{
    if(state!==null&&!valid(state))throw Error('Invalid anchor state');
    if(state&&state.sequence===checkpoint.sequence&&state.hash===checkpoint.hash)return {result:undefined};
    if(checkpoint.sequence!==(state?.sequence||0)+1)throw Error('Anchor sequence mismatch');
    return {write:true,state:{sequence:checkpoint.sequence,hash:checkpoint.hash}};
   });
  }
 });
}
function loadAuditAnchor({auditFile,anchorFile,keyFile}){
 if(![auditFile,anchorFile,keyFile].every(x=>typeof x==='string'&&path.isAbsolute(x)))throw Error('Absolute audit, anchor and key paths required');
 const auditDir=fs.realpathSync(path.dirname(auditFile)),anchorDir=fs.realpathSync(path.dirname(anchorFile));
 if(auditDir===anchorDir)throw Error('Anchor must use a separate protected directory');
 const fd=fs.openSync(keyFile,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 let key;
 try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size!==32||(stat.mode&0o077)!==0)throw Error('Private 32-byte audit key file required');key=fs.readFileSync(fd)}finally{fs.closeSync(fd)}
 return createFileAuditAnchor({file:anchorFile,key,auditId:path.join(auditDir,path.basename(auditFile))});
}
module.exports={createFileAuditAnchor,loadAuditAnchor};
