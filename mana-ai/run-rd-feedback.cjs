'use strict';
const path=require('node:path'),{createFeedback}=require('./src/pilot/mana-rd-feedback.cjs');
const [mode,priorWorkspace,masterPath,...extra]=process.argv.slice(2);
async function main(){
 if(+process.versions.node.split('.')[0]<24||!['inspect','repair'].includes(mode)||!priorWorkspace||!masterPath||extra.length)throw Error('Node.js 24+: node run-rd-feedback.cjs <inspect|repair> /absolute/original-private-workspace /absolute/master.txt');
 const loop=createFeedback({priorWorkspace,masterPath,catalogPath:path.resolve(__dirname,'rd-pilot/catalog.json'),catalogSha256:'d0a4041fb609a781f34e701f7ac6517bdfb1a34a2cbf382899c62d977eef922c',mission:'net-finish-length-mm',expectedPriorDigest:'3b508590a19b82f516a860fa4720e018142ec809b78a4f2a74837dcb0ffda41f',expectedMissing:['width_mm','excluded_mm']});
 if(mode==='inspect')return loop.inspect();
 const {createFeedbackAdviser}=require('./src/pilot/mana-rd-feedback-adviser.cjs');
 return loop.repair(createFeedbackAdviser({port:8794,model:process.env.MANA_CONVERSATION_MODEL_ID}));
}
main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(JSON.stringify({status:'BLOCKED',error:e.message}));process.exitCode=1;});
