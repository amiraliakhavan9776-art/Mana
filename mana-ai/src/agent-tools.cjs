'use strict';
const {validateProjects} = require('./projects.cjs');
const {validateDocuments} = require('./documents.cjs');
const {retrieve} = require('./retrieval.cjs');
function createReadOnlyAgentTools({projects=[],documents=[]}={}) {
  const safeProjects=validateProjects(projects);
  const safeDocuments=validateDocuments(documents);
  return Object.freeze({
    'documents:read': async ({principal,scope,input,signal})=>{
      if(signal?.aborted) throw new Error('Aborted');
      if (!input || Object.keys(input).some(k=>k!=='question') || typeof input.question!=='string' || !input.question.trim() || input.question.length>4000) throw new Error('Invalid query');
      const project=safeProjects.find(p=>p.id===scope && p.orgId===principal.orgId);
      if(!project) throw new Error('Project not found');
      const matches=retrieve({principal,projectId:scope,question:input.question,projects:safeProjects,documents:safeDocuments});
      return {projectId:scope,sources:matches.map(m=>({documentId:m.documentId,title:m.title,excerpt:m.excerpt}))};
    }
  });
}
module.exports={createReadOnlyAgentTools};
