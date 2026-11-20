'use strict';
// Deliberately no HTTP/model adapter imported for review, approval, execution or deactivation.
const path=require('node:path');
const {createWorkbench}=require('./src/pilot/mana-rd-loop.cjs');
const config={
 catalogPath:path.resolve(__dirname,'rd-pilot/catalog.json'),
 catalogSha256:'d0a4041fb609a781f34e701f7ac6517bdfb1a34a2cbf382899c62d977eef922c'
};
const [action,workspace,masterPath,...args]=process.argv.slice(2);
const expected={inspect:0,propose:0,review:1,approve:3,activate:2,deactivate:3};
const usage='Node.js 24+: node run-rd-pilot.cjs <inspect|propose|review|approve|activate|run|deactivate> /private/workspace /absolute/master.txt [mission] [review-digest] [reason or JSON integer array]';
async function main(){
 if(+process.versions.node.split('.')[0]<24||!workspace||!masterPath||!Object.hasOwn({...expected,run:3},action)||args.length!==(action==='run'?3:expected[action]))throw Error(usage);
 const workbench=createWorkbench({...config,workspace,masterPath});
 const [id,digest,tail]=args;
 switch(action){
 case 'inspect':return workbench.inspect();
 case 'review':return workbench.review(id);
 case 'approve':return workbench.approve({id,digest,reason:tail});
 case 'activate':return workbench.activate({id,digest});
 case 'deactivate':return workbench.deactivate({id,digest,reason:tail});
 case 'run':return workbench.run({id,digest,values:JSON.parse(tail)});
 case 'propose':{
  const {createRdLocalAdviser}=require('./src/pilot/mana-rd-local-adviser.cjs');
  const model=process.env.MANA_CONVERSATION_MODEL_ID;
  if(!model)throw Error('Provide explicit MANA_CONVERSATION_MODEL_ID for propose only');
  return workbench.proposeNext(createRdLocalAdviser({port:8794,model}));
 }
 }
}
main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(JSON.stringify({status:'BLOCKED',error:e.message}));process.exitCode=1;});
