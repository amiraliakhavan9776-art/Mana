'use strict';
const {canAccessProject}=require('../security.cjs');
const {payloadDigest}=require('../approval-store.cjs');
const ID=/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/,HASH=/^[a-f0-9]{64}$/;
function createArtifactImpact({authorize,verifySnapshot}={}){
 if(typeof authorize!=='function'||typeof verifySnapshot!=='function')throw Error('Trusted artifact registry authorities required');
 function snapshot(value,project,allowMissing){
  payloadDigest(value);const graph=JSON.parse(JSON.stringify(value));
  if(!graph||Object.keys(graph).sort().join(',')!=='artifacts,organizationId,projectId'||graph.organizationId!==project.orgId||graph.projectId!==project.id||!Array.isArray(graph.artifacts)||graph.artifacts.length>64)throw Error('Bounded scoped artifact snapshot required');
  let edges=0;const byId=new Map();
  for(const row of graph.artifacts){
   if(!row||Object.keys(row).sort().join(',')!=='dependsOn,id,kind,requiresApproval,requiresProfessionalSignoff,sha256,version'||![row.id,row.kind,row.version].every(x=>typeof x==='string'&&ID.test(x))||!HASH.test(row.sha256)||typeof row.requiresApproval!=='boolean'||typeof row.requiresProfessionalSignoff!=='boolean'||!Array.isArray(row.dependsOn)||byId.has(row.id))throw Error('Invalid artifact registry record');
   const pins=new Set();for(const pin of row.dependsOn){if(!pin||Object.keys(pin).sort().join(',')!=='id,sha256,version'||![pin.id,pin.version].every(x=>typeof x==='string'&&ID.test(x))||!HASH.test(pin.sha256)||pin.id===row.id||pins.has(pin.id)||++edges>256)throw Error('Invalid artifact dependency pin');pins.add(pin.id);}
   row.dependsOn.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);byId.set(row.id,row);
  }
  const order=[],pending=new Set(byId.keys());while(pending.size){const ready=[...pending].filter(id=>byId.get(id).dependsOn.every(pin=>!pending.has(pin.id))).sort();if(!ready.length)throw Error('Cyclic artifact dependencies');for(const id of ready){pending.delete(id);order.push(id);}}
  if(!allowMissing&&graph.artifacts.some(r=>r.dependsOn.some(p=>!byId.has(p.id))))throw Error('Complete prior artifact registry required');
  graph.artifacts.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);return {graph,byId,order,digest:payloadDigest(graph)};
 }
 return Object.freeze({analyze({principal,project,before,after}){
  if(!canAccessProject(principal,project)||!principal.capabilityIds?.includes('native.artifacts.impact')||authorize(principal,'artifacts.impact',project)!==true)throw Error('Artifact impact access denied');
  const previous=snapshot(before,project,false),current=snapshot(after,project,true);
  for(const [role,data] of [['before',previous],['after',current]])if(verifySnapshot({role,snapshot:JSON.parse(JSON.stringify(data.graph)),digest:data.digest,principal,project})!==true)throw Error('Current artifact registry authority not verified');
  const ids=[...new Set([...previous.byId.keys(),...current.byId.keys()])].sort(),changed=ids.filter(id=>{const a=previous.byId.get(id),b=current.byId.get(id);return !a||!b||payloadDigest(a)!==payloadDigest(b);});
  const stale=new Map(),missing=new Set();for(const row of current.graph.artifacts){const invalid=row.dependsOn.filter(pin=>{const target=current.byId.get(pin.id);if(!target)missing.add(pin.id);return !target||target.version!==pin.version||target.sha256!==pin.sha256;});if(invalid.length)stale.set(row.id,invalid.map(p=>p.id));}
  // Union old/new consumers so deleting an edge cannot conceal an old dependency.
  const consumers=new Map(ids.map(id=>[id,new Set()]));for(const data of [previous,current])for(const row of data.graph.artifacts)for(const pin of row.dependsOn)if(consumers.has(pin.id))consumers.get(pin.id).add(row.id);
  const causes=new Map(),seeds=[...new Set([...changed,...stale.keys()])].sort();for(const root of seeds){const pending=[root],seen=new Set();while(pending.length){const id=pending.shift();if(seen.has(id))continue;seen.add(id);if(!causes.has(id))causes.set(id,new Set());causes.get(id).add(root);pending.push(...(consumers.get(id)??[]));}}
  const blocked=new Set(current.graph.artifacts.filter(r=>r.dependsOn.some(p=>!current.byId.has(p.id))).map(r=>r.id));let size=-1;while(size!==blocked.size){size=blocked.size;for(const row of current.graph.artifacts)if(row.dependsOn.some(p=>blocked.has(p.id)))blocked.add(row.id);}
  const unversioned=changed.filter(id=>{const a=previous.byId.get(id),b=current.byId.get(id);return a&&b&&a.sha256!==b.sha256&&a.version===b.version;});
  const impacts=ids.filter(id=>causes.has(id)).map(id=>{const a=previous.byId.get(id),b=current.byId.get(id);return {artifactId:id,kind:(b??a).kind,status:!b?'REMOVED':!a?'ADDED_REVIEW_REQUIRED':stale.has(id)?'STALE_DEPENDENCY_BINDING':a.sha256!==b.sha256?'CONTENT_CHANGED_REVIEW_REQUIRED':changed.includes(id)?'METADATA_CHANGED_REVIEW_REQUIRED':'UPSTREAM_CHANGE_REVIEW_REQUIRED',causeArtifactIds:[...causes.get(id)].sort(),staleDependencyIds:stale.get(id)??[],blockedByMissingDependencies:blocked.has(id),reviewRequired:true,requiresApproval:a?.requiresApproval===true||b?.requiresApproval===true,requiresProfessionalSignoff:a?.requiresProfessionalSignoff===true||b?.requiresProfessionalSignoff===true};});
  return {schema:'MANA_ARTIFACT_IMPACT_V1',status:missing.size?'DEPENDENCIES_UNRESOLVED':unversioned.length?'SOURCE_VERSION_REVIEW_REQUIRED':impacts.length?'CHANGE_IMPACT_PROPOSED':'NO_DETECTED_CHANGE',organizationId:project.orgId,projectId:project.id,beforeDigest:previous.digest,afterDigest:current.digest,changedArtifactIds:changed,unversionedChangeArtifactIds:unversioned,missingDependencyIds:[...missing].sort(),impacts,sourceReviewArtifactIds:current.order.filter(id=>causes.has(id)&&!current.byId.get(id).dependsOn.length),refreshOrder:current.order.filter(id=>causes.has(id)&&current.byId.get(id).dependsOn.length&&!blocked.has(id)),blockedArtifactIds:[...blocked].sort(),approvalRecheckRequiredArtifactIds:impacts.filter(r=>r.requiresApproval).map(r=>r.artifactId),professionalSignoffRecheckRequiredArtifactIds:impacts.filter(r=>r.requiresProfessionalSignoff).map(r=>r.artifactId),actionsExecuted:0,approved:false,artifactsChanged:false,productionDeploymentAllowed:false,limitation:'Verified metadata dependency impact only; refresh means independently verify or regenerate through existing tools. No geometry validation, file rewrite, approval revocation or professional signoff is performed.'};
 }});
}
module.exports={createArtifactImpact};
