'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const files=['aec-layout-solver.cjs','aec-access-plan.cjs','aec-quality-gate.cjs','jarvis-shared-mission.cjs','jarvis-runtime-bridge.cjs','jarvis-quality-repair-runtime.cjs','scoped-aec-tools.cjs'];
function bindAecTools(tools){
 const configurationDigest=crypto.createHash('sha256').update(JSON.stringify(files.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex')]))).digest('hex');
 function scoped(context){const scope=context?.scope;if(!scope||typeof scope.projectId!=='string'||typeof scope.organizationId!=='string')return false;const objects=[context.input,context.input?.brief,context.input?.layout,context.result,context.result?.layout,context.result?.quality,...(context.dependencies??[]).flatMap(d=>[d.result,d.result?.layout,d.result?.quality])];return objects.every(o=>!o||!Object.hasOwn(o,'projectId')||o.projectId===scope.projectId);}
 return tools.map(tool=>({...tool,configurationDigest,validate:(input,context)=>scoped({...context,input})&&tool.validate(input,context)===true,run:context=>{if(!scoped(context))throw Error('AEC tool scope denied');return tool.run(context);},verify:context=>scoped(context)&&tool.verify(context)===true}));
}
module.exports={bindAecTools};
