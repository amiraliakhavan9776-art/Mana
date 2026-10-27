'use strict';
const fs=require('node:fs');
const {createLocalOpenAICompatibleProvider}=require('./src/engine.cjs');
const {planBusiness}=require('./src/autopilot-orchestrator.cjs');
async function main(){
  if(process.argv.length!==3) throw Error('Usage: node autopilot-local.cjs input.json');
  const baseUrl=process.env.MANA_AI_LOCAL_PROVIDER_URL;
  const model=process.env.MANA_AI_MODEL;
  if(!baseUrl||!model) throw Error('Set MANA_AI_LOCAL_PROVIDER_URL and MANA_AI_MODEL for local inference');
  const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  const provider=createLocalOpenAICompatibleProvider({baseUrl});
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),60000);
  try{
    const result=await planBusiness({input,provider,model,signal:controller.signal});
    console.log(JSON.stringify(result,null,2));
  }finally{clearTimeout(timeout);}
}
main().catch(e=>{console.error('Autopilot planning failed:',e.message);process.exitCode=1;});
