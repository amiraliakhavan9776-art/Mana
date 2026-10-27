'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
const {createMissionRuntime}=require('../src/native/mission-runtime.cjs'),{createMissionProjection}=require('../src/integration/mission-projection.cjs');
async function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-projection-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const project={id:'p',orgId:'org'},principal={id:'u',orgId:'org',role:'analyst',projectIds:['p','q'],capabilityIds:['x',...['create','read','run'].map(x=>'native.mission.'+x)]};let allowed=true,brokenAudit=false;
 const file=path.join(dir,'missions.enc'),runtime=createMissionRuntime({file,key:Buffer.alloc(32,5),authorize:()=>allowed,tools:[{id:'x',title:'Synthetic private output',requires:['source'],produces:['done'],risk:'read',workUnits:1,version:'v1',validate:()=>true,validateDependencies:d=>d.length===0,run:()=>({private:'RESULT-SECRET'}),verify:()=>true}]});
 const create=(key,p=project)=>runtime.create({principal,project:p,objective:'OBJECTIVE-SECRET',goals:['done'],evidence:[{id:'e',orgId:'org',projectId:p.id,key:'source',value:true,source:'synthetic-projection-test',verification:'verified'}],inputs:{x:{private:'INPUT-SECRET'}},requestKey:key}).mission;
 const missions=[create('first'),create('second'),create('third')],other=create('other',{id:'q',orgId:'org'});await runtime.runNext({principal,project,missionId:missions[0].id});
 const events=[],handler=createMissionProjection({runtime,project,authenticate:req=>req.headers.authorization==='Bearer local-test'?principal:req.headers.authorization==='Bearer foreign'?{...principal,orgId:'foreign'}:null,audit:{record:async event=>{if(brokenAudit)throw Error('PRIVATE AUDIT PATH');events.push(event);}}});
 const server=http.createServer((req,res)=>{handler(req,res).then(handled=>{if(!handled){res.writeHead(404);res.end();}}).catch(()=>{res.writeHead(500);res.end();});});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port,request=(suffix='',options={})=>fetch(base+'/api/missions'+suffix,{...options,headers:{authorization:'Bearer local-test',...options.headers}});
 return {file,runtime,project,principal,missions,other,events,request,deny:()=>{allowed=false},breakAudit:()=>{brokenAudit=true}};
}
test('legacy-shaped projection reads only the shared runtime, paginates within project and redacts input/result content',async t=>{
 const s=await setup(t),before=fs.readFileSync(s.file);
 const first=await s.request('?limit=2');assert.equal(first.status,200);const a=await first.json(),cursor=first.headers.get('x-mana-next-cursor');assert.equal(a.length,2);assert.ok(cursor);
 const next=await s.request('?limit=2&after='+cursor),b=await next.json();assert.equal(b.length,1);assert.equal(next.headers.get('x-mana-next-cursor'),null);
 const ids=[...a,...b].map(x=>x.id);assert.equal(new Set(ids).size,3);assert.ok(!ids.includes(s.other.id));assert.ok([...a,...b].every(x=>x.approved===false&&x.executionOwner==='MANA_MISSION_RUNTIME_V1'));
 const detail=await s.request('/'+s.missions[0].id);assert.equal(detail.status,200);const body=await detail.text();assert.ok(!/INPUT-SECRET|RESULT-SECRET|OBJECTIVE-SECRET/.test(body));assert.equal(JSON.parse(body).tasks[0].status,'succeeded');
 assert.ok(s.events.some(e=>e.outcome==='allowed'));assert.ok(fs.readFileSync(s.file).equals(before));
});
test('authentication, foreign scopes, revoked policy, forged query scope and mutating methods never expose missions',async t=>{
 const s=await setup(t),before=fs.readFileSync(s.file);
 assert.equal((await s.request('',{headers:{authorization:''}})).status,401);
 assert.equal((await s.request('',{headers:{authorization:'Bearer foreign'}})).status,404);
 assert.equal((await s.request('/'+s.other.id)).status,404);
 assert.equal((await s.request('/'+crypto.randomUUID())).status,404);
 for(const query of ['?projectId=q','?limit=101','?limit=1&limit=2','?after='+s.other.id])assert.equal((await s.request(query)).status,400);
 assert.equal((await s.request('',{method:'POST',body:'{}'})).status,405);s.deny();assert.equal((await s.request()).status,404);assert.ok(fs.readFileSync(s.file).equals(before));
});
test('audit failure withholds the response payload and never leaks internal error text',async t=>{
 const s=await setup(t);s.breakAudit();const response=await s.request('/'+s.missions[0].id);assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'audit_unavailable'});
});
test('projection refuses implicit identity or a competing history reader at construction',()=>{
 assert.throws(()=>createMissionProjection({runtime:{get(){},list(){}},project:{id:'p',orgId:'org'},audit:{record(){}}}),/Authenticated/);
});
