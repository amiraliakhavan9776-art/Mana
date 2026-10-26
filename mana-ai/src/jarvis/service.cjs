'use strict';
// Personal interface to the SAME MANA runtime; no alternative executor.
const {timingSafeEqual}=require('node:crypto'),path=require('node:path');
const {createMissionRuntime}=require('../native/mission-runtime.cjs');
const {ownerScope,createPersonalMemory}=require('./personal-memory.cjs');
function createJarvisService({owner,authorize,evidenceSnapshot,tools,missionFile,missionKey,memoryFile,memoryKey,now=Date.now}={}){
 const scope=ownerScope(owner),identity=Object.freeze({id:owner.id,realm:owner.realm});
 if(typeof authorize!=='function'||typeof evidenceSnapshot!=='function'||!Array.isArray(tools)||!Buffer.isBuffer(missionKey)||!Buffer.isBuffer(memoryKey)||missionKey.length!==32||memoryKey.length!==32||timingSafeEqual(missionKey,memoryKey)||path.resolve(missionFile)===path.resolve(memoryFile))throw Error('Separate personal state, keys and host policy required');
 const project=Object.freeze({id:'personal',orgId:'jarvis_'+scope.slice(0,40)}),principal=Object.freeze({id:identity.id,orgId:project.orgId,role:'analyst',projectIds:Object.freeze(['personal']),capabilityIds:Object.freeze([...tools.map(t=>t.id),...['create','read','run','control','reconcile','replan'].map(x=>'native.mission.'+x)])});
 function check(subject,op){if(subject?.id!==identity.id||subject?.realm!==identity.realm||authorize(subject,'jarvis.'+op)!==true)throw Error('Jarvis access denied')}
 // A trusted host policy still rechecks runtime operations and every tool grant.
 const runtime=createMissionRuntime({file:missionFile,key:missionKey,tools,now,authorize:(_p,op)=>authorize(identity,'jarvis.mission.'+op)===true&&tools.every(t=>authorize(identity,'jarvis.tool.'+t.id)===true)});
 const memory=createPersonalMemory({file:memoryFile,key:memoryKey,owner:identity,authorize,now});
 const methods={};for(const op of ['get','runNext','pause','resume','cancel','retry','reconcile','replan'])methods[op]=({subject,...args})=>{check(subject,'mission.'+op);if(Object.keys(args).some(k=>!['missionId','expectedVersion','taskId','attemptId','result','evidenceReference','signal','inputs','maxWorkUnits'].includes(k)))throw Error('Unexpected Jarvis mission field');return runtime[op]({...args,principal,project,...(op==='replan'?{evidence:evidenceSnapshot({owner:identity,project})}:{})})};
 return Object.freeze({
  createMission({subject,...request}){check(subject,'mission.create');if(Object.keys(request).some(k=>!['objective','goals','inputs','requestKey','maxWorkUnits'].includes(k)))throw Error('Unexpected Jarvis request field');const evidence=evidenceSnapshot({owner:identity,project});if(!Array.isArray(evidence))throw Error('Host evidence required');return runtime.create({...request,principal,project,evidence})},
  ...methods,memory
 });
}
module.exports={createJarvisService};
