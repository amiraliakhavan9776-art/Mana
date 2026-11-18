'use strict';
// Real loopback HTTP + actual sandbox + durable restart. No fixture fallback.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {createDevelopmentRunner}=require('./src/development/runner.cjs');
const {start}=require('./development-ui.cjs');
async function main(){
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'mana-real-acceptance-'));
 const server=start({port:0,runner:createDevelopmentRunner({workspace})});
 await new Promise(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port;
 try{
  const html=await (await fetch(url)).text(),token=html.match(/'X-Mana-Token':'([a-f0-9]+)'/)[1];
  for(const id of ['b2a25ed5f5cdb0ae','1cbe338190bce8d1']){
   const response=await fetch(url+'/run',{method:'POST',headers:{Origin:url,'X-Mana-Token':token}}),r=await response.json();
   assert.equal(r.mission?.id,id);if(r.status!=='BENCHMARK_PASSED')throw Error(r.reason+' '+(r.error||''));
   assert.ok(r.selectedBecause&&r.output);assert.equal(r.productionDeploymentAllowed,false);
  }
  assert.equal((await (await fetch(url+'/history')).json()).length,2);
  assert.equal((await createDevelopmentRunner({workspace}).run()).status,'SUPPORTED_BENCHMARKS_COMPLETE');
  console.log(JSON.stringify({status:'LOCAL_HTTP_SANDBOX_ACCEPTANCE_PASSED',tests:4,missions:2,workspace,productionDeploymentAllowed:false}));
 }finally{await new Promise(r=>server.close(r));}
}
main().catch(error=>{console.error('ACCEPTANCE_NOT_PASSED: '+error.message);process.exitCode=1;});
