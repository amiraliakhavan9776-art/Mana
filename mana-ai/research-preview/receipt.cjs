'use strict';
// A single, local, review-only slot. Trusted owner workspace, not a signed ledger.
const fs=require('node:fs'),path=require('node:path'),{createHash,randomBytes}=require('node:crypto');
const C=fs.constants,CLAIM='claim.json',TERMINAL='terminal.json';
const CLAIM_SCHEMA='MANA_QUEUE_RESEARCH_CLAIM_V1',TERMINAL_SCHEMA='MANA_QUEUE_RESEARCH_TERMINAL_V1';
const MAX_SLOT=4096,MAX_CLAIM=16384,MAX_TERMINAL=262144;
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const plain=v=>v!==null&&typeof v==='object'&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const fields=(o,k)=>plain(o)&&same(Object.keys(o).sort(),k.slice().sort());
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const stamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;

function encoded(value,max){
 let budget=6000,bytes=0;
 const count=n=>{bytes+=n;if(bytes>max)fail('RECEIPT_TOO_LARGE');};
 function visit(v,depth){
  if(--budget<0||depth>18)fail('INVALID_RECEIPT_DATA');
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='string'){count(Buffer.byteLength(v));return v;}
  if(typeof v==='number'&&Number.isFinite(v)&&!Object.is(v,-0))return v;
  if(Array.isArray(v)){
   if(v.length>4096||Object.getOwnPropertySymbols(v).length||Object.keys(v).length!==v.length)fail('INVALID_RECEIPT_DATA');
   return Array.from({length:v.length},(_,i)=>{
    const d=Object.getOwnPropertyDescriptor(v,String(i));
    if(!d||!Object.hasOwn(d,'value'))fail('INVALID_RECEIPT_DATA');
    return visit(d.value,depth+1);
   });
  }
  if(!plain(v)||Object.getOwnPropertySymbols(v).length)fail('INVALID_RECEIPT_DATA');
  return Object.fromEntries(Object.keys(v).sort().map(k=>{
   const d=Object.getOwnPropertyDescriptor(v,k);
   if(!Object.hasOwn(d,'value')||['__proto__','constructor','prototype'].includes(k))fail('INVALID_RECEIPT_DATA');
   count(Buffer.byteLength(k));return [k,visit(d.value,depth+1)];
  }));
 }
 const b=Buffer.from(JSON.stringify(visit(value,0))+'\n');if(b.length>max)fail('RECEIPT_TOO_LARGE');
 return b;
}
const snapshot=(v,max)=>JSON.parse(encoded(v,max));
const digest=(v,max)=>sha(encoded(v,max));

function createReceiptStore({workspace,slot}={}){
 if(Number(process.versions.node.split('.')[0])<24)fail('RECEIPT_NEEDS_NODE_24');
 if(typeof workspace!=='string'||!path.isAbsolute(workspace)||path.resolve(workspace)!==workspace||typeof process.getuid!=='function')fail('PRIVATE_WORKSPACE_REQUIRED');
 const owner=BigInt(process.getuid());
 function identity(){
  try{
   if(fs.realpathSync(workspace)!==workspace)fail('PRIVATE_WORKSPACE_REQUIRED');
   const st=fs.lstatSync(workspace,{bigint:true});
   if(!st.isDirectory()||(st.mode&0o7777n)!==0o700n||st.uid!==owner)fail('PRIVATE_WORKSPACE_REQUIRED');
   return {workspace,dev:String(st.dev),ino:String(st.ino)};
  }catch(e){if(['ENOENT','ENOTDIR','ELOOP'].includes(e.code))fail('PRIVATE_WORKSPACE_REQUIRED');throw e;}
 }
 const bound=identity();
 function current(){if(!same(identity(),bound))fail('WORKSPACE_CHANGED');}
 if(!plain(slot))fail('EXACT_SLOT_ID_REQUIRED');
 const slotCopy=snapshot(slot,MAX_SLOT);
 if(typeof slotCopy.id!=='string'||!/^[A-Za-z0-9_.:-]{1,120}$/.test(slotCopy.id))fail('EXACT_SLOT_ID_REQUIRED');
 const slotSha256=digest(slotCopy,MAX_SLOT);
 const file=name=>path.join(workspace,name);
 function readFile(name,max){
  let fd;
  try{fd=fs.openSync(file(name),C.O_RDONLY|C.O_NOFOLLOW|C.O_NONBLOCK);}
  catch(e){if(e.code==='ENOENT')return null;if(e.code==='ELOOP')fail('INVALID_RECEIPT_FILE');throw e;}
  try{
   const st=fs.fstatSync(fd,{bigint:true});
   if(!st.isFile()||st.uid!==owner||(st.mode&0o7777n)!==0o600n||st.size<2n||st.size>BigInt(max))fail('INVALID_RECEIPT_FILE');
   const b=Buffer.alloc(Number(st.size)+1);let off=0;
   while(off<b.length){const n=fs.readSync(fd,b,off,b.length-off,null);if(!n)break;off+=n;}
   if(off!==Number(st.size))fail('RECEIPT_CHANGED');
   const body=b.subarray(0,off);let value;
   try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}catch{fail('CORRUPT_RECEIPT');}
   // Exact canonical bytes also reject duplicate JSON keys, lossy decode and partial writes.
   if(!plain(value)||!body.equals(encoded(value,max)))fail('CORRUPT_RECEIPT');
   return value;
  }finally{fs.closeSync(fd);}
 }
 function syncDir(){
  const fd=fs.openSync(workspace,C.O_RDONLY|C.O_DIRECTORY|C.O_NOFOLLOW);
  try{
   const st=fs.fstatSync(fd,{bigint:true});
   if(String(st.dev)!==bound.dev||String(st.ino)!==bound.ino)fail('WORKSPACE_CHANGED');
   fs.fsyncSync(fd);
  }finally{fs.closeSync(fd);}
 }
 function publish(name,value,max){
  current();
  const bytes=encoded(value,max),temp=file('.receipt-stage-'+randomBytes(16).toString('hex')+'.tmp');
  const fd=fs.openSync(temp,C.O_WRONLY|C.O_CREAT|C.O_EXCL|C.O_NOFOLLOW,0o600);
  try{
   try{fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   current();
   try{fs.linkSync(temp,file(name));}catch(e){if(e.code==='EEXIST')return false;throw e;}
   syncDir();current();return true;
  }finally{
   // Stages never grant a claim. A crash before link therefore permits a future
   // first claim; a crash after publishing a claim remains UNKNOWN without retry.
   current();
   fs.unlinkSync(temp);
   syncDir();
  }
 }
 function checkClaim(claim){
  if(!fields(claim,['schema','workspace','slot','slotSha256','claimId','createdAt','claimSha256'])||claim.schema!==CLAIM_SCHEMA||!same(claim.workspace,snapshot(bound,MAX_SLOT))||claim.slotSha256!==slotSha256||!same(claim.slot,slotCopy)||typeof claim.claimId!=='string'||!/^[a-f0-9]{48}$/.test(claim.claimId)||!stamp(claim.createdAt))fail('CLAIM_BINDING_MISMATCH');
  const {claimSha256,...body}=claim;
  if(!hex(claimSha256)||digest(body,MAX_CLAIM)!==claimSha256)fail('CORRUPT_CLAIM');
  return claimSha256;
 }
 function read(){
  current();
  let claim=readFile(CLAIM,MAX_CLAIM);const terminal=readFile(TERMINAL,MAX_TERMINAL);
  // A different process may have atomically published both records between reads.
  if(!claim&&terminal)claim=readFile(CLAIM,MAX_CLAIM);
  current();
  if(!claim&&terminal)fail('ORPHAN_TERMINAL_RECEIPT');
  if(!claim)return {state:'EMPTY'};
  const claimSha256=checkClaim(claim);
  if(!terminal)return {state:'UNKNOWN',claimSha256};
  if(!fields(terminal,['schema','claimSha256','slotSha256','result','terminalSha256'])||terminal.schema!==TERMINAL_SCHEMA||terminal.claimSha256!==claimSha256||terminal.slotSha256!==slotSha256||!plain(terminal.result))fail('TERMINAL_BINDING_MISMATCH');
  const {terminalSha256,...body}=terminal;
  if(!hex(terminalSha256)||digest(body,MAX_TERMINAL)!==terminalSha256)fail('CORRUPT_TERMINAL');
  return {state:'TERMINAL',claimSha256,terminalSha256,result:terminal.result};
 }
 function claim(){
  const observed=read();
  if(observed.state!=='EMPTY')return observed;
  const body={schema:CLAIM_SCHEMA,workspace:bound,slot:slotCopy,slotSha256,claimId:randomBytes(24).toString('hex'),createdAt:new Date().toISOString()};
  const claimSha256=digest(body,MAX_CLAIM),record={...body,claimSha256};
  if(!publish(CLAIM,record,MAX_CLAIM)){
   const winner=read();
   if(winner.state==='EMPTY')fail('CLAIM_CHANGED');
   return winner;
  }
  function commit(result){
   if(!plain(result))fail('INVALID_TERMINAL_RESULT');
   const observed=read();
   if(observed.state!=='UNKNOWN'||observed.claimSha256!==claimSha256)fail('CLAIM_NOT_CURRENT');
   const body={schema:TERMINAL_SCHEMA,claimSha256,slotSha256,result:snapshot(result,MAX_TERMINAL)};
   const terminalSha256=digest(body,MAX_TERMINAL);
   if(!publish(TERMINAL,{...body,terminalSha256},MAX_TERMINAL))fail('TERMINAL_ALREADY_EXISTS');
   return read();
  }
  return {state:'CLAIMED',claimSha256,commit};
 }
 return {read,claim};
}
module.exports={createReceiptStore};
