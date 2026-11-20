'use strict';
// Real Chromium UI and receipt replay. Both model replies are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createRequire}=require('node:module'),{once}=require('node:events');
const {chromium}=createRequire(path.resolve(__dirname,'../../tests/browser/package.json'))('playwright');
const {start}=require('../development-ui.cjs');
const {createManaSkillPilot,COMMAND:V1_COMMAND}=require('../src/pilot/mana-skill-pilot.cjs');
const {createManaSkillDependencePilot,COMMAND,RECEIPT_COMMAND}=require('../src/pilot/mana-skill-dependence.cjs');
const v1ProviderId='8794:/opt/mana-ai/models/gemma-3-4b-it-Q4_K_M.gguf';
const leaf=field=>({field});
const op=(op,...args)=>({op,args});
const badV1=JSON.stringify(op('add',{value:1000},{value:1000}));
const valid=JSON.stringify(op('add',leaf('first_mm'),leaf('second_mm')));
const ignoresSecond=JSON.stringify(op('add',leaf('first_mm'),op('subtract',leaf('second_mm'),leaf('second_mm'))));
const read=(dir,name)=>fs.readFileSync(path.join(dir,name));
const runner={history:()=>[],run:async()=>{throw Error('Unexpected development mission');}};
async function withApp(options,task){
 const server=start({port:0,runner,...options});
 await once(server,'listening');
 try{return await task('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
async function browserCase(browser,mobile){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mana-skill-dependence-chromium-'));
 const prior=path.join(root,'prior'),workspace=path.join(root,'current');
 fs.mkdirSync(prior,{mode:0o700});fs.mkdirSync(workspace,{mode:0o700});
 let priorCalls=0,calls=0,page;
 try{
  const v1=createManaSkillPilot({workspace:prior,providerId:v1ProviderId,propose:async()=>{priorCalls++;return badV1;}});
  const failed=await v1.run();
  assert.equal(failed.status,'BENCHMARK_FAILED');assert.equal(failed.passed,1);assert.equal(failed.testsRun,10);
  const oldClaim=read(prior,'claim.json'),oldReceipt=read(prior,'receipt.json');
  page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,locale:'fa-IR'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await withApp({skillPilot:v1},async origin=>{
   await page.goto(origin+'/mana');
   assert.equal(await page.getByRole('button',{name:V1_COMMAND,exact:true}).count(),1);
   assert.equal(await page.getByRole('button',{name:COMMAND,exact:true}).count(),0);
   assert.equal(priorCalls,1,'opening the legacy path is read only');
  });
  const followUp=createManaSkillDependencePilot({workspace,priorWorkspace:prior,providerId:v1ProviderId,propose:async()=>{calls++;return mobile?ignoresSecond:valid;}});
  await withApp({skillDependencePilot:followUp},async origin=>{
   await page.goto(origin);
   await page.locator('a[href="/mana"]').click();
   assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
   const send=page.locator('#send'),input=page.locator('#text'),confirm=page.locator('#confirm');
   const submit=async click=>{
    const pending=page.waitForResponse(r=>r.url().endsWith('/mana/turn')&&r.request().method()==='POST');
    await click();const response=await pending;assert.equal(response.status(),200);
    const data=await response.json();await page.waitForFunction(()=>!document.getElementById('send').disabled);
    return data;
   };
   const clickExample=async command=>{
    await page.getByRole('button',{name:command,exact:true}).click();
    assert.equal(await input.inputValue(),command);
   };
   await clickExample(COMMAND);
   assert.equal(calls,0);
   const preview=await submit(()=>send.click());
   assert.equal(preview.status,'CONFIRM_REQUIRED');
   assert.equal(await confirm.isVisible(),true);
   assert.equal(calls,0);assert.deepEqual(fs.readdirSync(workspace),[]);
   const result=await submit(()=>confirm.click());
   assert.equal(calls,1);
   assert.equal(await confirm.isVisible(),false);
   const currentReceipt=read(workspace,'receipt.json'),currentClaim=read(workspace,'claim.json');
   const receipt=JSON.parse(currentReceipt);
   assert.equal(receipt.result.passed,mobile?0:10);assert.equal(receipt.result.testsRun,mobile?0:10);
   assert.equal(receipt.result.status,mobile?'DEPENDENCE_REJECTED':'PASSED_AWAITING_REVIEW');
   if(mobile)assert.deepEqual(receipt.result.insensitive,['second_mm']);
   assert.equal(result.status,mobile?'BLOCKED':'COMPLETED');
   assert.match(await page.locator('#thread article').last().textContent(),mobile?/اثر/u:/بازبینی/u);
   await page.reload();assert.equal(calls,1);
   await clickExample(RECEIPT_COMMAND);
   const previous=await submit(()=>send.click());
   assert.equal(previous.status,result.status);
   assert.equal(await confirm.isVisible(),false);
   await clickExample(COMMAND);
   assert.equal((await submit(()=>send.click())).status,result.status);
   assert.equal(await confirm.isVisible(),false);
   assert.equal(calls,1);assert.equal(priorCalls,1);
   assert.deepEqual(read(workspace,'receipt.json'),currentReceipt);assert.deepEqual(read(workspace,'claim.json'),currentClaim);
   assert.deepEqual(read(prior,'claim.json'),oldClaim);assert.deepEqual(read(prior,'receipt.json'),oldReceipt);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  });
  assert.deepEqual(errors,[]);
  console.log('MANA_SKILL_DEPENDENCE_CHROMIUM_'+(mobile?'MOBILE':'DESKTOP')+'_PASSED (fixture proposal; old and new receipts read-only)');
 }finally{
  if(page)await page.close();
  fs.rmSync(root,{recursive:true,force:true});
 }
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.MANA_CHROMIUM_EXECUTABLE?{executablePath:process.env.MANA_CHROMIUM_EXECUTABLE}:{})});
 try{for(const mobile of [true,false])await browserCase(browser,mobile);}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
