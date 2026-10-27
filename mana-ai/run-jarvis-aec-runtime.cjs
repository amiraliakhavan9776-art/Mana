'use strict';
/** Local, synthetic example. No external API or production service. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createJarvisAecBridge}=require('./src/native/jarvis-runtime-bridge.cjs');
async function main(){
 const output=process.argv[2];if(!output||!path.isAbsolute(output)||fs.existsSync(output))throw Error('Provide a new absolute output directory');
 fs.mkdirSync(output,{recursive:true,mode:0o700});
 const working=fs.mkdtempSync(path.join(os.tmpdir(),'mana-jarvis-runtime-'));
 const project={id:'plot1',orgId:'company1'},principal={id:'localreviewer',orgId:'company1',role:'admin',projectIds:['plot1'],capabilityIds:['jarvis.aec.layout','jarvis.aec.quality','jarvis.aec.report',...['create','read','run','control','reconcile'].map(x=>'native.mission.'+x)]};
 const brief={projectId:'plot1',widthM:12,depthM:10,rooms:[{id:'living',widthM:6,depthM:5},{id:'kitchen',widthM:4,depthM:3},{id:'bed',widthM:4,depthM:4}],adjacencies:[['living','kitchen']]};
 const bridge=createJarvisAecBridge({file:path.join(working,'private.enc'),key:crypto.randomBytes(32),authorize:()=>true});
 const started=bridge.start({principal,project,missionId:'jarvis_demo',objective:'Create schematic layout, independently review, and produce an evidence-based report',brief,requestKey:'demo1'});
 let mission=started.created.mission;for(let i=0;i<3;i++)mission=await bridge.advance({principal,project,missionId:mission.id});
 if(mission.status!=='completed')throw Error('Local demonstration did not complete');
 const report=mission.tasks.find(t=>t.capabilityId==='jarvis.aec.report').result;
 fs.writeFileSync(path.join(output,'report.md'),report.markdown,{flag:'wx',mode:0o600});
 const receipt={schema:'MANA_JARVIS_RUNTIME_DEMO_V1',syntheticBrief:true,missionStatus:mission.status,qualityStatus:report.qualityStatus,professionalApproval:false,missionSteps:mission.tasks.map(t=>({capability:t.capabilityId,status:t.status,resultDigest:t.resultDigest})),reportSha256:crypto.createHash('sha256').update(report.markdown).digest('hex')};
 fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({...receipt,outputDirectory:output},null,2));
}
main().catch(err=>{console.error(err.message);process.exitCode=1});
