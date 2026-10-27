'use strict';
// Read-only, lossless reconciliation. Does not import, normalize money, or approve data.
const {createHash}=require('node:crypto');
const {parseExactJSON:parseExact}=require('./exact-json.cjs');
const MAX=20*1024*1024;
function canonical(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
const digest=value=>createHash('sha256').update(value).digest('hex');
function exactNumbers(value){
 if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('Unsafe numeric representation; exact decimals and large integers require a reviewed string mapping');
 if(value&&typeof value==='object')for(const child of Object.values(value))exactNumbers(child);
}
function inspect(snapshot){
 if(!snapshot||typeof snapshot.databaseJson!=='string'||Buffer.byteLength(snapshot.databaseJson)>MAX||!Array.isArray(snapshot.attachments))throw Error('Explicit bounded database and attachment export required');
 if(Buffer.byteLength(JSON.stringify(snapshot.attachments))>MAX)throw Error('Attachment export too large');
 const db=parseExact(snapshot.databaseJson);
 exactNumbers(db);exactNumbers(snapshot.attachments);
 if(!db||Array.isArray(db)||db.meta?.v!==2||!Array.isArray(db.projects)||!db.settings||typeof db.settings!=='object'||Array.isArray(db.settings))throw Error('Unsupported legacy schema');
 const records=new Map(),collections={},issues=[];
 for(const [name,rows] of Object.entries(db)){
  if(name==='meta'||name==='settings')continue;
  if(!Array.isArray(rows))throw Error('Unknown non-collection field: '+name);
  const ids=new Map();collections[name]=rows.length;
  for(const row of rows){
   if(!row||Array.isArray(row)||typeof row.id!=='string'||!row.id||ids.has(row.id))throw Error('Invalid or duplicate record: '+name);
   ids.set(row.id,row);
  }
  records.set(name,ids);
 }
 for(const [name,rows] of records)for(const [id,row] of rows){
  if(row.projectId!=null&&!records.get('projects').has(row.projectId))issues.push({code:'orphan-project',collection:name,id});
  if(row.contractId!=null){
   const contract=records.get('contracts')?.get(row.contractId);
   if(!contract)issues.push({code:'orphan-contract',collection:name,id});
   else if(row.projectId!=null&&contract.projectId!=null&&row.projectId!==contract.projectId)issues.push({code:'cross-project-contract',collection:name,id});
  }
 }
 const attachments=new Map();
 for(const a of snapshot.attachments){
  if(!a||typeof a.id!=='string'||!a.id||attachments.has(a.id)||typeof a.ownerKey!=='string'||typeof a.data!=='string'||!a.data.startsWith('data:'))throw Error('Invalid or duplicate attachment');
  attachments.set(a.id,a);
 }
 return {db,records,attachments,collections,issues,rawDigest:digest(snapshot.databaseJson),attachmentDigest:digest(canonical([...attachments].sort(([a],[b])=>a.localeCompare(b)))),unverifiedInvoiceIds:[...(records.get('invoices')||[])].filter(([,r])=>!r.status||(r.status==='approved'&&r.approvedBy==='سیستم')).map(([id])=>id).sort()};
}
function compareLegacySnapshots(before,after){
 const a=inspect(before),b=inspect(after),differences=[];
 const compare=(scope,left,right)=>{
  for(const id of [...new Set([...left.keys(),...right.keys()])].sort()){
   if(!left.has(id))differences.push({scope,id,kind:'added'});
   else if(!right.has(id))differences.push({scope,id,kind:'missing'});
   else if(canonical(left.get(id))!==canonical(right.get(id)))differences.push({scope,id,kind:'changed',beforeDigest:digest(canonical(left.get(id))),afterDigest:digest(canonical(right.get(id)))});
  }
 };
 for(const name of [...new Set([...a.records.keys(),...b.records.keys()])].sort()){
  if(!a.records.has(name)||!b.records.has(name))differences.push({scope:name,kind:'collection-set-changed'});
  compare(name,a.records.get(name)||new Map(),b.records.get(name)||new Map());
 }
 compare('$metadata',new Map([['meta',a.db.meta],['settings',a.db.settings]]),new Map([['meta',b.db.meta],['settings',b.db.settings]]));
 compare('$attachments',a.attachments,b.attachments);
 const summary=x=>({rawDigest:x.rawDigest,attachmentDigest:x.attachmentDigest,collections:x.collections,attachmentCount:x.attachments.size,issues:x.issues,unverifiedInvoiceIds:x.unverifiedInvoiceIds});
 return {contract:'MANA_LEGACY_LOSSLESS_RECONCILIATION_V1',passed:!differences.length&&!a.issues.length&&!b.issues.length,before:summary(a),after:summary(b),differences,limitations:['Schema-v2 semantic record comparison; original raw digests retained. Approved transformations require a separate versioned mapping.','Only safe integer JSON numbers accepted; exact decimals and large integers must be strings. Does not establish financial correctness or approval validity.','Attachment owner namespaces and all domain-specific relationships require semantic inventory.','No migration, write, key recovery or production acceptance is performed.']};
}
module.exports={compareLegacySnapshots};
