'use strict';
// Compatibility route shape only. No legacy report execution, state import or second writer.
function createMissionProjection({runtime,project,authenticate,audit}){
 if(!runtime||!['list','get'].every(k=>typeof runtime[k]==='function')||typeof authenticate!=='function'||!audit||typeof audit.record!=='function'||!project||![project.id,project.orgId].every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x)))throw Error('Authenticated scoped projection configuration required');
 project=Object.freeze({id:project.id,orgId:project.orgId});
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
 const summary=m=>({id:m.id,status:m.status,version:m.version,created_at:new Date(m.createdAt).toISOString(),approved:false,executionOwner:'MANA_MISSION_RUNTIME_V1'});
 return async function handle(req,res){
  const raw=req.url||'';if(!raw.startsWith('/api/missions'))return false;
  const reply=(status,data,headers={})=>{const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store','x-content-type-options':'nosniff',...headers});res.end(body);return true;};
  let principal;
  const record=async outcome=>{try{await audit.record({actorId:principal?.id,orgId:principal?.orgId,projectId:project.id,action:'mission-projection:read',outcome});return true;}catch{reply(503,{error:'audit_unavailable'});return false;}};
  if(raw.length>2048)return reply(414,{error:'uri_too_long'});
  try{principal=await authenticate(req);}catch{principal=null;}
  if(!principal){if(!await record('unauthorized'))return true;return reply(401,{error:'unauthorized'});}
  if(req.method!=='GET'){if(!await record('method_denied'))return true;return reply(405,{error:'read_only'},{allow:'GET'});}
  let url,missionId=null,limit=50,after=null;
  try{
   url=new URL(raw,'http://localhost');
   if(url.pathname!=='/api/missions'){
    const match=url.pathname.match(/^\/api\/missions\/([^/]+)$/);if(!match||!uuid.test(match[1])||url.search)throw Error('Invalid route');missionId=match[1];
   }else{
    for(const key of url.searchParams.keys())if(!['limit','after'].includes(key)||url.searchParams.getAll(key).length!==1)throw Error('Unknown projection query');
    const value=url.searchParams.get('limit');if(value!==null){if(!/^[1-9]\d{0,2}$/.test(value))throw Error('Invalid limit');limit=Number(value);if(limit>100)throw Error('Invalid limit');}
    after=url.searchParams.get('after');if(after!==null&&!uuid.test(after))throw Error('Invalid cursor');
   }
  }catch{if(!await record('invalid'))return true;return reply(400,{error:'invalid_projection_request'});}
  let result,headers={};
  try{
   if(missionId){
    const m=runtime.get({principal,project,missionId});
    result={...summary(m),tasks:m.tasks.map(t=>({id:t.taskId,capabilityId:t.capabilityId,status:t.status,attempts:t.attempts.length})),notice:'Execution status only; no financial or professional approval is represented.'};
   }else{
    const page=runtime.list({principal,project,limit,after});result=page.items.map(m=>({...summary(m),taskCounts:m.taskCounts}));if(page.nextCursor)headers['x-mana-next-cursor']=page.nextCursor;
   }
  }catch(error){
   const denied=['Mission access denied','Mission not found'].includes(error.message),invalid=['Invalid mission cursor','Invalid mission pagination'].includes(error.message);
   if(!await record(denied?'denied':invalid?'invalid':'unavailable'))return true;
   return reply(denied?404:invalid?400:503,{error:denied?'not_found':invalid?'invalid_projection_request':'runtime_unavailable'});
  }
  if(!await record('allowed'))return true;return reply(200,result,headers);
 };
}
module.exports={createMissionProjection};
