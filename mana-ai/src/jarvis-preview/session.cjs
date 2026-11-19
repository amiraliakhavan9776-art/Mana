'use strict';
// Dedicated local synthetic architecture preview, not the production Jarvis host.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createJarvisService}=require('../jarvis/service.cjs');
const {createArtifactTools}=require('../workflows/artifact-tools.cjs');
const {interpretPersianRequest}=require('../workflows/persian-request.cjs');
const {runExecutionCycle}=require('../workflows/execution-cycle.cjs');
const {spawnSync}=require('node:child_process');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const LIMIT='طرح شماتیک دوخوابه با قواعد ثابت؛ نه نقشهٔ اجرایی، تأیید ضوابط، فهم عمومی فارسی یا دستیار صوتی. فایل‌ها با ابزار محلی مورداعتماد ساخته می‌شوند، نه اجرای کد دلخواه در سندباکس.';
function regular(file,max){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>max)throw Error('Invalid local file');return fs.readFileSync(file);}
function createSession({workspace}={}){
 if(typeof workspace!=='string'||!path.isAbsolute(workspace))throw Error('Dedicated absolute workspace required');
 const repo=path.resolve(__dirname,'../../..');if(path.resolve(workspace)===repo||path.resolve(workspace).startsWith(repo+path.sep))throw Error('Workspace must be outside repository');
 fs.mkdirSync(workspace,{recursive:true,mode:0o700});const st=fs.lstatSync(workspace);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)||fs.realpathSync(workspace)!==path.resolve(workspace))throw Error('Private real workspace required');
 const lock=path.join(workspace,'preview.lock');const fd=fs.openSync(lock,'wx',0o600);fs.closeSync(fd);
 let closed=false;
 function close(){if(!closed){closed=true;fs.unlinkSync(lock);}}
 try{
 const keyFile=path.join(workspace,'keys.json'),indexFile=path.join(workspace,'missions.json'),artifacts=path.join(workspace,'artifacts');
 if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,JSON.stringify({mission:crypto.randomBytes(32).toString('hex'),memory:crypto.randomBytes(32).toString('hex')}),{flag:'wx',mode:0o600});
 if(fs.statSync(keyFile).mode&0o077)throw Error('Private keys required');
 const keys=JSON.parse(regular(keyFile,1024));if(!/^[a-f0-9]{64}$/.test(keys.mission)||!/^[a-f0-9]{64}$/.test(keys.memory))throw Error('Invalid keys');
 fs.mkdirSync(artifacts,{recursive:true,mode:0o700});if(fs.realpathSync(artifacts)!==artifacts||fs.lstatSync(artifacts).isSymbolicLink())throw Error('Invalid artifact directory');
 let ids=fs.existsSync(indexFile)?JSON.parse(regular(indexFile,20000)):[];
 if(!Array.isArray(ids)||ids.length>100||ids.some(x=>typeof x!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(x)))throw Error('Invalid mission index');
 for(const name of ['missions.enc','memory.enc'])if(fs.existsSync(path.join(workspace,name)))regular(path.join(workspace,name),20000000);
 const owner={id:'preview-owner',realm:'local-synthetic-preview'};
 const tools=createArtifactTools({outputDirectory:artifacts}).filter(t=>t.id.startsWith('architecture.'));
 const service=createJarvisService({owner,tools,authorize:(subject,op)=>subject.id===owner.id&&subject.realm===owner.realm&&op.startsWith('jarvis.'),evidenceSnapshot:({project})=>[{id:'source',orgId:project.orgId,projectId:project.id,key:'source',value:true,source:'user-declared-synthetic-dimensions-not-measured-site',verification:'verified'}],missionFile:path.join(workspace,'missions.enc'),memoryFile:path.join(workspace,'memory.enc'),missionKey:Buffer.from(keys.mission,'hex'),memoryKey:Buffer.from(keys.memory,'hex'),missionTimeoutMs:30000});
 const context=id=>{if(!ids.includes(id))throw Error('Unknown scoped mission');return {subject:owner,missionId:id};};
 function view(id){const m=service.get(context(id));let status=m.status;
 if(status==='completed'){const proof=path.join(workspace,'verified-'+id+'.json');status='preview_unverified';if(fs.existsSync(proof)){const r=JSON.parse(regular(proof,4096));if(r.missionId===id&&r.artifactsDigest===sha(JSON.stringify(m.tasks.flatMap(t=>t.result?.artifacts||[])))&&r.verification?.plans===2&&r.verification?.status==='independent_geometry_checks_passed')status='completed';}}
 return {id:m.id,status,version:m.version,request:m.objective,dimensions:m.inputs['architecture.design'],limitations:LIMIT,tasks:m.tasks.map(t=>({title:({'architecture.design':'ساخت دو گزینهٔ پلان و DXF','architecture.takeoff':'مترهٔ مدل هندسی','architecture.booklet':'دفترچهٔ PDF'})[t.capabilityId],status:t.status})),artifacts:m.tasks.filter(t=>t.status==='succeeded').flatMap(t=>(t.result?.artifacts||[]).map(a=>({id:sha(id+'\n'+a.path),name:path.basename(a.path),bytes:a.bytes,sha256:a.sha256}))) };}
 function plan(text,revisionOf){if(closed)throw Error('Closed session');if(ids.length>=100)throw Error('Preview mission limit reached');const p=interpretPersianRequest(text);if(p.status!=='GROUNDED_PROPOSAL'||p.workflow!=='architecture')return {created:false,status:p.status==='GROUNDED_PROPOSAL'?'NEEDS_CAPABILITY':p.status,reason:p.reason||'architecture_only',limitations:LIMIT};if(revisionOf)context(revisionOf);
 const r=service.createFromText({subject:owner,text,requestKey:crypto.randomUUID(),...(revisionOf?{revisionOf}: {})});if(!r.mission)throw Error('Mission was not created');ids.push(r.mission.id);const temp=indexFile+'.new';fs.writeFileSync(temp,JSON.stringify(ids),{flag:'wx',mode:0o600});fs.renameSync(temp,indexFile);return {created:true,mission:view(r.mission.id)};}
 async function run(id){const result=await runExecutionCycle({service,context:context(id),maxSteps:3});let verification=null;
 if(result.mission.status==='completed'){
  const expected=['option-a.dxf','option-b.dxf','plans.json','project-booklet.pdf','takeoff.json'];
  const visible=view(id);if(JSON.stringify(visible.artifacts.map(a=>a.name).sort())!==JSON.stringify(expected))throw Error('Expected artifacts missing');
  for(const a of visible.artifacts)download(id,a.id);
  const design=result.mission.tasks.find(t=>t.capabilityId==='architecture.design'),drawing=design.result.artifacts.find(a=>a.path.endsWith('/option-a.dxf'));
  const checked=spawnSync('python3',[path.resolve(__dirname,'../../tools/verify_artifacts.py'),artifacts,path.dirname(path.join(artifacts,drawing.path))],{timeout:5000,maxBuffer:100000,encoding:'utf8'});
  if(checked.status!==0)throw Error('Independent geometry verification failed');verification=JSON.parse(checked.stdout);
  if(verification.plans!==2||verification.status!=='independent_geometry_checks_passed')throw Error('Incomplete geometry verification');
  const proof=path.join(workspace,'verified-'+id+'.json');const data=JSON.stringify({missionId:id,artifactsDigest:sha(JSON.stringify(result.mission.tasks.flatMap(t=>t.result?.artifacts||[]))),verification});
  if(fs.existsSync(proof)){if(regular(proof,4096).toString()!==data)throw Error('Verification receipt conflict');}else fs.writeFileSync(proof,data,{flag:'wx',mode:0o600});
 }
 return {mission:view(id),review:result.review.status,stopped:result.mission.status==='completed'?'completed':result.stopped,verification};}
 function download(id,artifactId){const m=service.get(context(id));const a=m.tasks.filter(t=>t.status==='succeeded').flatMap(t=>t.result?.artifacts||[]).find(a=>sha(id+'\n'+a.path)===artifactId);if(!a||!/^([a-f0-9]{64})\/[A-Za-z0-9._-]+$/.test(a.path))throw Error('Unknown artifact');const file=path.join(artifacts,a.path);if(fs.realpathSync(file)!==file)throw Error('Artifact path changed');const b=regular(file,5000000);if(b.length!==a.bytes||sha(b)!==a.sha256)throw Error('Artifact changed');return {bytes:b,name:path.basename(a.path)};}
 return {plan,run,view,download,list:()=>ids.map(view).reverse(),close};
 }catch(e){close();throw e;}
}
module.exports={createSession,LIMIT};
