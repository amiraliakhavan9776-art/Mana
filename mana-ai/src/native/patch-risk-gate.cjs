'use strict';
/** MANA V15: deterministic, fail-closed risk assessment for source proposals.
 * Advisory scanner, not a sandbox and not a proof of harmlessness.
 */
const crypto=require('node:crypto');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const RULES=Object.freeze([
 ['DYNAMIC_EXEC', /\b(?:eval|Function)\s*\(|\bexec\s*\(/g],
 ['PROCESS_SPAWN', /\b(?:spawn|execFile|execSync|spawnSync)\s*\(|child_process/g],
 ['SHELL_COMMAND', /\b(?:os\.system|subprocess\.|shell\s*:\s*true)\b/g],
 ['NETWORK', /\b(?:fetch\s*\(|https?\.request|urllib\.|requests\.|socket\.)/g],
 ['CREDENTIAL_ACCESS', /(?:\.env\b|process\.env\b|\/etc\/shadow|\.ssh\/|\.aws\/)/g],
 ['FILESYSTEM_DESTRUCTION', /\b(?:rmSync|rmdirSync|unlinkSync)\s*\(|shutil\.rmtree\s*\(/g],
]);
function inspectPatch({files,allowedFiles,baseHashes,requestSha256}={}){
 if(!Array.isArray(files)||!Array.isArray(allowedFiles)||!baseHashes||typeof baseHashes!=='object'||!Array.isArray(allowedFiles)||!allowedFiles.length||!(/^[a-f0-9]{64}$/).test(requestSha256??''))throw Error('Invalid review inputs');
 const allowed=new Set(allowedFiles), seen=new Set(), findings=[], hashes=[];
 if(allowed.size!==allowedFiles.length||files.length>allowed.size)throw Error('Invalid allowlist');
 for(const f of files){
  if(!f||typeof f.path!=='string'||typeof f.content!=='string'||!allowed.has(f.path)||seen.has(f.path))throw Error('Out-of-scope or duplicate candidate');
  if(!(/^[a-f0-9]{64}$/).test(baseHashes[f.path]??''))throw Error('Missing source baseline');
  if(Buffer.byteLength(f.content)>100000||f.content.includes('\0'))throw Error('Unsafe candidate size/content');
  seen.add(f.path); hashes.push({path:f.path,sha256:sha(f.content)});
  for(const [rule,regex] of RULES){regex.lastIndex=0;const match=regex.exec(f.content);if(match)findings.push({path:f.path,rule,offset:match.index});}
 }
 if(!files.length)throw Error('Empty patch');
 return Object.freeze({schema:'MANA_PATCH_RISK_GATE_V1',status:findings.length?'MANUAL_SECURITY_REVIEW':'STATIC_SCREEN_PASSED',findings,hashes,requestSha256,staticOnly:true,sandboxVerified:false,approved:false,productionDeploymentAllowed:false});
}
module.exports={inspectPatch};
