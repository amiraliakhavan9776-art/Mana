'use strict';
const {canAccessProject}=require('../security.cjs');
function createNativeApi({core,authenticate,projects,evidence=[],audit}){
 if(!core||typeof core.plan!=='function'||typeof core.evaluate!=='function'||typeof authenticate!=='function'||!audit||typeof audit.record!=='function'||!Array.isArray(projects)||!Array.isArray(evidence)||evidence.length>500)throw Error('Invalid native API configuration');
 const serialized=JSON.stringify(evidence);if(Buffer.byteLength(serialized)>1024*1024)throw Error('Evidence snapshot too large');
 const snapshot=JSON.parse(serialized);
 return async function handle(req,res){
  const route=(req.url||'').split('?')[0];
  if(!['/v1/native/plan','/v1/native/evaluate'].includes(route))return false;
  const reply=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));return true};
  let principal;
  try{principal=await authenticate(req)}catch{return reply(401,{error:'unauthorized'})}
  if(!principal)return reply(401,{error:'unauthorized'});
  if(req.method!=='POST')return reply(405,{error:'method_not_allowed'});
  if(req.headers['content-type']?.split(';')[0]!=='application/json')return reply(415,{error:'expected_json'});
  let input;
  try{
   let size=0;const chunks=[];
   for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>32768){req.resume();return reply(413,{error:'payload_too_large'})}chunks.push(chunk)}
   input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   const allowed=route.endsWith('/plan')?['projectId','objective','goals','maxWorkUnits']:['projectId','criteria','alternatives'];
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))return reply(400,{error:'invalid_input'});
  }catch{return reply(400,{error:'invalid_input'})}
  const project=projects.find(p=>p.id===input.projectId&&canAccessProject(principal,p));
  const record=outcome=>audit.record({actorId:principal.id,orgId:principal.orgId,projectId:project?.id,action:route,outcome});
  try{
   if(!project){record('denied');return reply(404,{error:'project_not_found'})}
   let result;
   try{
    result=route.endsWith('/plan')?core.plan({principal,project,objective:input.objective,goals:input.goals,maxWorkUnits:input.maxWorkUnits,evidence:snapshot}):core.evaluate({principal,project,criteria:input.criteria,alternatives:input.alternatives,evidence:snapshot});
   }catch{record('invalid');return reply(400,{error:'invalid_native_request'})}
   record('allowed');return reply(200,result);
  }catch{return reply(503,{error:'audit_unavailable'})}
 };
}
module.exports={createNativeApi};
