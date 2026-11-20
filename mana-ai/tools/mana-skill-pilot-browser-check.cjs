'use strict';
// Real Chromium UI and durable trial implementation; model proposal is a fixture.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createRequire}=require('node:module'),{once}=require('node:events');
const {chromium}=createRequire(path.resolve(__dirname,'../../tests/browser/package.json'))('playwright');
const {start}=require('../development-ui.cjs');
const {createManaSkillPilot,COMMAND}=require('../src/pilot/mana-skill-pilot.cjs');

const candidate=JSON.stringify({op:'add',args:[{field:'first_mm'},{field:'second_mm'}]});
async function browserCase(browser,mobile){
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'mana-skill-chromium-'));
 let calls=0,server,page,errors=[];
 try{
  const skillPilot=createManaSkillPilot({workspace,propose:async()=>{calls++;return candidate;}});
  server=start({port:0,skillPilot,runner:{history:()=>[],run:async()=>{throw Error('Unexpected development mission');}}});
  await once(server,'listening');
  page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,locale:'fa-IR'});
  page.on('pageerror',e=>errors.push(e.message));
  const send=page.locator('#send'),input=page.locator('#text'),confirm=page.locator('#confirm');
  const waitTurn=async click=>{
   const pending=page.waitForResponse(r=>r.url().endsWith('/mana/turn')&&r.request().method()==='POST');
   await click();
   const response=await pending;
   assert.equal(response.status(),200);
   const result=await response.json();
   await page.waitForFunction(()=>!document.getElementById('send').disabled);
   return result;
  };
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('a[href="/mana"]').click();
  assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  assert.equal(calls,0);
  await page.getByRole('button',{name:COMMAND,exact:true}).click();
  assert.equal(await input.inputValue(),COMMAND);
  assert.equal(calls,0,'example click must not submit a proposal');
  const preview=await waitTurn(()=>send.click());
  assert.equal(preview.status,'CONFIRM_REQUIRED');
  assert.equal(await confirm.isVisible(),true);
  assert.equal(calls,0,'preview is read only');
  assert.deepEqual(fs.readdirSync(workspace),[],'preview must not persist a claim');
  const approved=await waitTurn(()=>confirm.click());
  assert.equal(approved.status,'COMPLETED');
  assert.equal(calls,1);
  assert.equal(await confirm.isVisible(),false);
  const receiptPath=path.join(workspace,'receipt.json'),contents=fs.readFileSync(receiptPath);
  const receipt=JSON.parse(contents);
  assert.equal(receipt.result.status,'PASSED_AWAITING_REVIEW');
  assert.equal(receipt.result.passed,receipt.result.total);
  assert.equal(receipt.result.testsRun,receipt.result.total);
  assert.match(await page.locator('#thread article').last().textContent(),/بازبینی/u);

  await page.reload();
  assert.equal(calls,1,'refresh is read only');
  assert.equal(await confirm.isVisible(),false);
  const receiptCommand='رسید مهارت متره';
  await page.getByRole('button',{name:receiptCommand,exact:true}).click();
  assert.equal(await input.inputValue(),receiptCommand);
  const prior=await waitTurn(()=>send.click());
  assert.equal(prior.status,'COMPLETED');
  assert.match(prior.details,/10 از 10/);
  assert.match(prior.details,/مدل دوباره صدا زده نشد/u);
  await input.fill(COMMAND);
  assert.equal((await waitTurn(()=>send.click())).status,'COMPLETED');
  assert.equal(await confirm.isVisible(),false,'settled result must not show another approval');
  assert.match(await page.locator('#thread article').last().textContent(),/بازبینی/u);
  assert.equal(calls,1,'looking up the existing receipt does not dispatch');
  assert.deepEqual(fs.readFileSync(receiptPath),contents,'receipt is immutable');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('MANA_SKILL_PILOT_CHROMIUM_'+(mobile?'MOBILE':'DESKTOP')+'_PASSED (fixture proposal, real approval and durable receipt)');
 }finally{
  if(page)await page.close();
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(workspace,{recursive:true,force:true});
 }
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.MANA_CHROMIUM_EXECUTABLE?{executablePath:process.env.MANA_CHROMIUM_EXECUTABLE}:{})});
 try{for(const mobile of [true,false])await browserCase(browser,mobile);}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
