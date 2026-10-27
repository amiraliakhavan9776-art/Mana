'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createJarvisRepairBridge}=require('./src/native/jarvis-quality-repair-runtime.cjs');
const {solve}=require('./src/native/aec-layout-solver.cjs');
async function main(){
 const output=process.argv[2]||fs.mkdtempSync(path.join(os.tmpdir(),'mana-v10-demo-'));
 if(!path.isAbsolute(output)||fs.existsSync(output)&&fs.readdirSync(output).length)throw Error('Supply a new or empty absolute output directory');
 fs.mkdirSync(output,{recursive:true,mode:0o700});
 const project={id:'demo_plot',orgId:'demo_org'},brief={projectId:project.id,widthM:12,depthM:10,rooms:[{id:'living',widthM:6,depthM:5},{id:'kitchen',widthM:4,depthM:3},{id:'bed',widthM:4,depthM:4}],adjacencies:[['living','kitchen']]};
 const layout=solve(brief);layout.rooms[0].xM=100;
 const bridge=createJarvisRepairBridge({file:path.join(output,'mission-state.enc'),key:require('node:crypto').randomBytes(32),authorize:()=>true});
 const principal={id:'demo_user',orgId:project.orgId,role:'admin',projectIds:[project.id],capabilityIds:[...bridge.tools.map(t=>t.id),...['create','read','run','control','reconcile'].map(p=>'native.mission.'+p)]};
 const created=bridge.start({principal,project,objective:'Independently review and repair this damaged schematic building layout',brief,layout,requestKey:'sample_review'});
 if(!created.created)throw Error('Mission could not be planned');
 let mission=created.mission;
 for(let i=0;i<4;i++)mission=await bridge.runNext({principal,project,missionId:mission.id});
 if(mission.status!=='completed')throw Error('Mission did not complete');
 const result=mission.tasks.at(-1).result;
 fs.writeFileSync(path.join(output,'report.md'),result.markdown,{mode:0o600});
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({missionStatus:mission.status,taskStatuses:mission.tasks.map(x=>x.status),repairStatus:result.repairStatus,schematicStatus:result.status,engineeringApproved:result.engineeringApproved,constructionReady:result.constructionReady,candidateDigest:result.candidateDigest},null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({output,missionStatus:mission.status,repairStatus:result.repairStatus,schematicStatus:result.status,engineeringApproved:false},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
