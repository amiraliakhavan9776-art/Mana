'use strict';
// Reproducible source evidence, NOT a semantic parser or G1 approval.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const hash=data=>createHash('sha256').update(data).digest('hex');
function inventory(){
 const names=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).filter(p=>!p.startsWith('docs/generated/')).sort();
 const files=names.map(name=>{
  const bytes=fs.readFileSync(path.join(root,name)),text=bytes.toString('utf8');
  const candidates=pattern=>[...text.matchAll(pattern)].map(m=>({value:m[1]||m[2],line:text.slice(0,m.index).split('\n').length}));
  return {path:name,bytes:bytes.length,sha256:hash(bytes),gitBlob:createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),
   dependencyCandidates:candidates(/\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bfrom\s+['"]([^'"]+)['"]/g),
   environmentCandidates:candidates(/\bprocess\.env\.([A-Z][A-Z0-9_]*)/g),
   testFile:/(?:^|\/)tests?\//.test(name)};
 });
 return {contract:'MANA_SOURCE_EVIDENCE_V1',sourceSetDigest:hash(JSON.stringify(files.map(({path,sha256})=>({path,sha256})))),fileCount:files.length,files,limitations:['Tracked working-tree bytes; verify clean index and sourceSetDigest at review.','Generated outputs excluded to avoid self-referential digests.','Regex candidates may match strings/comments and omit dynamic imports/environment access.','No claim of complete semantic inventory, workflow ownership, license acceptance or gate approval.']};
}
if(require.main===module)process.stdout.write(JSON.stringify(inventory(),null,2)+'\n');
module.exports={inventory};
