'use strict';
// Standalone integration demo: deterministic mock model; no network or sensitive data.
const fs=require('node:fs');
const {planBusiness}=require('./src/autopilot-orchestrator.cjs');
const {createDraftExecutor}=require('./src/autopilot-executor.cjs');
async function run(input, {approve=false}={}) {
  const events=[];
  const provider={complete:async()=>JSON.stringify({
    summary:'Initial profession-aware workflow and strategy drafts',
    tasks:[{kind:'strategy_brief',reason:'Align goals and KPIs'},{kind:'brand_brief',reason:'Define brand position'},{kind:'operations_plan',reason:'Document operational responsibilities'}]
  })};
  const plan=await planBusiness({input,provider,model:'offline-demo-mock'});
  const executor=createDraftExecutor({audit:e=>events.push(e)});
  const drafts=approve ? plan.proposal.tasks.map(t=>executor.execute({
    plan,taskId:t.id,principal:{id:'demo-owner',permissions:['autopilot:draft']},approval:true
  })) : [];
  return {mode:'OFFLINE_DEMO_MOCK_NOT_AI',plan,drafts,audit:events};
}
if(require.main===module){
  (async()=>{
    if(process.argv.length<3||process.argv.length>4||process.argv[3]&&!['--approve-drafts'].includes(process.argv[3]))
      throw Error('Usage: node autopilot-demo.cjs input.json [--approve-drafts]');
    const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    console.log(JSON.stringify(await run(input,{approve:process.argv[3]==='--approve-drafts'}),null,2));
  })().catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={run};
