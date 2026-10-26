'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {calculateClaim}=require('./claims.cjs'),{parseExactJSON}=require('../exact-json.cjs'),{payloadDigest}=require('../approval-store.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function createClaimTools({sourceFile,outputDirectory,expectedSourceSha256,scope}){
 if(!path.isAbsolute(sourceFile)||!path.isAbsolute(outputDirectory)||!/^[a-f0-9]{64}$/.test(expectedSourceSha256)||!scope||Object.keys(scope).some(k=>!['organizationId','projectId'].includes(k))||![scope.organizationId,scope.projectId].every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x)))throw Error('Pinned scoped claim configuration required');
 scope=Object.freeze({...scope});const st=fs.lstatSync(outputDirectory);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))throw Error('Private output directory required');
 const root=fs.realpathSync(outputDirectory),source=path.resolve(sourceFile);
 function allowed(actual){return actual?.organizationId===scope.organizationId&&actual?.projectId===scope.projectId;}
 function check(actual){if(!allowed(actual))throw Error('Claim tool scope denied');}
 function read(){const fd=fs.openSync(source,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const s=fs.fstatSync(fd);if(!s.isFile()||s.size>12000)throw Error('Bounded claim source required');const b=fs.readFileSync(fd);if(hash(b)!==expectedSourceSha256)throw Error('Claim source changed');const document=parseExactJSON(b.toString('utf8'));calculateClaim(document,scope);return document;}finally{fs.closeSync(fd);}}
 // Fail before a mission is accepted if the host source/schema/policy is unsupported.
 read();
 const configurationDigest=payloadDigest({source,root,expectedSourceSha256,scope,code:['claims.cjs','../exact-json.cjs','../approval-store.cjs'].map(p=>hash(fs.readFileSync(path.resolve(__dirname,p))))});
 const equal=(a,b)=>payloadDigest(a)===payloadDigest(b);
 function inspectResult(){return {schema:'MANA_CLAIM_SOURCE_V1',sourceSha256:expectedSourceSha256,document:read()};}
 function calculation(){return {schema:'MANA_SCOPED_CLAIM_RESULT_V1',sourceSha256:expectedSourceSha256,calculation:calculateClaim(read(),scope)};}
 function dependencies(d,id,result){return Array.isArray(d)&&d.length===1&&d[0].capabilityId===id&&equal(d[0].result,result);}
 function descriptor(id,requires,produces,risk){return {id,title:id,requires,produces,risk,version:'v1',workUnits:1,retrySafe:true,configurationDigest,validate:(input,{scope:actual}={})=>allowed(actual)&&!!input&&Object.getPrototypeOf(input)===Object.prototype&&Object.keys(input).length===0};}
 const inspect={...descriptor('claims.inspect',['claim-source'],['claim-input'],'read'),validateDependencies:d=>Array.isArray(d)&&d.length===0,run:({scope:actual})=>{check(actual);return inspectResult();},verify:({scope:actual,result})=>allowed(actual)&&equal(result,inspectResult())};
 const calculate={...descriptor('claims.calculate',['claim-input'],['claim-calculated'],'read'),validateDependencies:d=>dependencies(d,'claims.inspect',inspectResult()),run:({scope:actual,dependencies:d})=>{check(actual);if(!dependencies(d,'claims.inspect',inspectResult()))throw Error('Unverified claim input');return calculation();},verify:({scope:actual,result})=>allowed(actual)&&equal(result,calculation())};
 function body(){return Buffer.from(JSON.stringify({...calculation(),schema:'MANA_CLAIM_DRAFT_REPORT_V1',notice:'Draft calculation for review; no approval, payment or accounting entry.'},null,2)+'\n');}
 function target(name){if(typeof name!=='string'||!/^[a-f0-9]{64}\.json$/.test(name))throw Error('Invalid claim report name');return path.join(root,name);}
 const report={...descriptor('claims.report',['claim-calculated'],['claim-report'],'draft'),validateDependencies:d=>dependencies(d,'claims.calculate',calculation()),run:({scope:actual,dependencies:d,idempotencyKey})=>{
  check(actual);if(typeof idempotencyKey!=='string'||!idempotencyKey||idempotencyKey.length>250||!dependencies(d,'claims.calculate',calculation()))throw Error('Invalid claim report context');
  const bytes=body(),name=hash(idempotencyKey)+'.json',file=target(name);let fd;
  try{fd=fs.openSync(file,'wx',0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}catch(e){if(e.code!=='EEXIST')throw e;const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size!==bytes.length||!fs.readFileSync(file).equals(bytes))throw Error('Claim artifact conflict');}finally{if(fd!==undefined)fs.closeSync(fd);}
  const directory=fs.openSync(root,'r');try{fs.fsyncSync(directory);}finally{fs.closeSync(directory);}
  return {schema:'MANA_CLAIM_REPORT_RECEIPT_V1',name,bytes:bytes.length,sha256:hash(bytes),inputDigest:calculation().calculation.inputDigest};
 },verify:({scope:actual,result})=>{
  if(!allowed(actual)||result?.schema!=='MANA_CLAIM_REPORT_RECEIPT_V1')return false;
  const file=target(result.name),expected=body(),s=fs.lstatSync(file);return s.isFile()&&!s.isSymbolicLink()&&s.size===expected.length&&result.bytes===expected.length&&result.sha256===hash(expected)&&result.inputDigest===calculation().calculation.inputDigest&&fs.readFileSync(file).equals(expected);
 }};
 return [inspect,calculate,report];
}
module.exports={createClaimTools};
