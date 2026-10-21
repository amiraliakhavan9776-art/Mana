'use strict';
const {validateProjects}=require('./projects.cjs');
const {validateDocuments}=require('./documents.cjs');
const ID=/^[A-Za-z0-9_-]{1,64}$/;
function prepareReadOnlyExport(payload,{orgId}={}) {
  if(!ID.test(orgId||'')) throw new Error('Invalid organization');
  if(!payload || typeof payload!=='object' || Array.isArray(payload) ||
    Object.keys(payload).some(k=>!['schemaVersion','projects','documents'].includes(k)) || payload.schemaVersion!==1)
    throw new Error('Invalid export schema');
  const projects=validateProjects(payload.projects);
  const documents=validateDocuments(payload.documents);
  if(projects.some(p=>p.orgId!==orgId) || documents.some(d=>d.orgId!==orgId)) throw new Error('Cross-organization export rejected');
  const projectIds=new Set(projects.map(p=>p.id));
  if(documents.some(d=>!projectIds.has(d.projectId))) throw new Error('Orphan document rejected');
  return Object.freeze({schemaVersion:1,projects,documents});
}
module.exports={prepareReadOnlyExport};
