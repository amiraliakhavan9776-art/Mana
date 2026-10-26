'use strict';
// Explicit local-operator CLI. No public identity, payment or production connection.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createMissionRuntime}=require('./src/native/mission-runtime.cjs'),{createClaimTools}=require('./src/financial/claim-tools.cjs');
async function main(){
 const [source,workspace,organizationId,projectId]=process.argv.slice(2);
 if(process.argv.length!==6||!path.isAbsolute(source)||!path.isAbsolute(workspace)||![organizationId,projectId].every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x)))throw Error('Usage: node mission-claim-run.cjs /absolute/source.json /absolute/private-workspace ORGANIZATION PROJECT');
 fs.mkdirSync(workspace,{recursive:true,mode:0o700});const directory=fs.lstatSync(workspace);if(!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o077))throw Error('Private workspace required');
 const keyFile=path.join(workspace,'claim-missions.key');try{fs.writeFileSync(keyFile,crypto.randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
 const fd=fs.openSync(keyFile,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let key;
 try{const st=fs.fstatSync(fd);if(!st.isFile()||(st.mode&0o077)||st.size!==32)throw Error('Private key required');key=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
 const sourceFd=fs.openSync(source,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let expectedSourceSha256;
 try{const st=fs.fstatSync(sourceFd);if(!st.isFile()||st.size>12000)throw Error('Bounded regular source required');expectedSourceSha256=crypto.createHash('sha256').update(fs.readFileSync(sourceFd)).digest('hex');}finally{fs.closeSync(sourceFd);}
 const tools=createClaimTools({sourceFile:source,outputDirectory:workspace,expectedSourceSha256,scope:{organizationId,projectId}}),project={id:projectId,orgId:organizationId},principal={id:'local-operator',orgId:organizationId,role:'analyst',projectIds:[projectId],capabilityIds:[...tools.map(t=>t.id),...['create','read','run'].map(x=>'native.mission.'+x)]};
 const runtime=createMissionRuntime({file:path.join(workspace,'claim-missions.enc'),key,tools,authorize:()=>true}),created=runtime.create({principal,project,objective:'Compute source-bound draft claim report',goals:['claim-report'],evidence:[{id:'source',orgId:organizationId,projectId,key:'claim-source',value:true,source:expectedSourceSha256,verification:'verified'}],inputs:Object.fromEntries(tools.map(t=>[t.id,{}])),requestKey:'claim-'+expectedSourceSha256.slice(0,32)});
 if(!created.mission)throw Error('Claim plan unavailable');const context={principal,project,missionId:created.mission.id};let current=runtime.get(context);
 while(current.status==='queued')current=await runtime.runNext(context);
 const receipt=current.status==='completed'?current.tasks.at(-1).result:null;
 process.stdout.write(JSON.stringify({status:current.status,missionId:current.id,sourceSha256:expectedSourceSha256,report:receipt?path.join(workspace,receipt.name):null,receipt},null,2)+'\n');if(current.status!=='completed')process.exitCode=2;
}
main().catch(()=>{process.stderr.write('Claim workflow refused or unavailable; no financial action performed.\n');process.exitCode=1;});
