'use strict';
const fs=require('node:fs');
const {prepareReadOnlyExport}=require('./import-boundary.cjs');
function loadApprovedExport(filePath,{orgId,maxBytes=3*1024*1024}={}) {
  if(typeof filePath!=='string'||!filePath.trim()) throw new Error('Export path required');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>3*1024*1024) throw new Error('Invalid export size limit');
  const stat=fs.lstatSync(filePath);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxBytes) throw new Error('Invalid export file');
  const payload=JSON.parse(fs.readFileSync(filePath,'utf8'));
  return prepareReadOnlyExport(payload,{orgId});
}
module.exports={loadApprovedExport};
