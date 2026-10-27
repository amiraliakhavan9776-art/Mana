'use strict';
/** Verifiable, context-bound test receipts. Key must be owned by trusted sandbox runner. */
const crypto=require('node:crypto');
const HEX=/^[0-9a-f]{64}$/;
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
function canonical(v){
 if(v===null||typeof v==='string'||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v)))return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype)return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
 throw Error('Invalid attestation value');
}
function validateContext(c){
 if(!c||!HEX.test(c.requestSha256)||!HEX.test(c.testSha256)||!Array.isArray(c.files)||c.files.length<1||c.files.length>10)throw Error('Invalid attestation context');
 const names=new Set();
 for(const f of c.files){if(!f||typeof f.path!=='string'||!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(f.path)||f.path.split('/').some(s=>s==='..'||s==='.')||names.has(f.path)||!HEX.test(f.newSha256))throw Error('Invalid attestation file');names.add(f.path)}
 return {requestSha256:c.requestSha256,testSha256:c.testSha256,files:c.files.map(f=>({path:f.path,newSha256:f.newSha256})).sort((a,b)=>a.path.localeCompare(b.path))};
}
function keyBuffer(key){const b=Buffer.isBuffer(key)?key:typeof key==='string'?Buffer.from(key,'hex'):null;if(!b||b.length<32)throw Error('Attestation key must be >=32 bytes');return b}
function signAttestation({key,context,passed,executed,sandboxVerified}){
 if(typeof passed!=='boolean'||executed!==true||sandboxVerified!==true)throw Error('Only completed sandbox executions can be attested');
 const c=validateContext(context),payload={schema:'MANA_SANDBOX_ATTESTATION_V1',...c,passed,executed:true,sandboxVerified:true};
 const signature=crypto.createHmac('sha256',keyBuffer(key)).update(canonical(payload)).digest('hex');
 return {...payload,signature};
}
function verifyAttestation({key,attestation,expected}){
 try{
  const c=validateContext(expected);
  if(!attestation||attestation.schema!=='MANA_SANDBOX_ATTESTATION_V1'||attestation.executed!==true||attestation.sandboxVerified!==true||typeof attestation.passed!=='boolean'||!HEX.test(attestation.signature||''))return false;
  const {signature,...payload}=attestation;
  const a=validateContext(attestation);
  if(canonical(a)!==canonical(c)||Object.keys(payload).sort().join('|')!==['schema','requestSha256','testSha256','files','passed','executed','sandboxVerified'].sort().join('|'))return false;
  const expectedSig=crypto.createHmac('sha256',keyBuffer(key)).update(canonical(payload)).digest();
  return crypto.timingSafeEqual(expectedSig,Buffer.from(signature,'hex'));
 }catch{return false}
}
module.exports={canonical,sha256,signAttestation,verifyAttestation};
