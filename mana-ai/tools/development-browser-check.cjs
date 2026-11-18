'use strict';
// UI-only checks use an explicit injected runner. Real sandbox acceptance is separate.
const {chromium}=require('../../tests/browser/node_modules/playwright');
const {start}=require('../development-ui.cjs');
const assert=require('node:assert/strict');
(async()=>{
 let calls=0;const rows=[];
 const server=start({port:0,runner:{history:()=>rows,run:async()=>{calls++;await new Promise(r=>setTimeout(r,150));const result={status:'BENCHMARK_PASSED',mission:{title:'آزمون رابط (دادهٔ تزریق‌شده)'},selectedBecause:'علت انتخاب آزمایشی',output:'دو آزمون رابط'};rows.push({title:result.mission.title,status:result.status});return result;}}});
 await new Promise(r=>server.once('listening',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.MANA_CHROMIUM_PATH?{executablePath:process.env.MANA_CHROMIUM_PATH}:{})});
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
   const page=await browser.newPage({viewport,locale:'fa-IR'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port);
   assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
   await page.getByRole('button',{name:'برو جلو'}).click();
   assert.equal(await page.locator('#run').isDisabled(),true);
   await page.waitForFunction(()=>document.querySelector('#status').textContent==='آزمون قبول شد');
   assert.match(await page.locator('#details').innerText(),/علت انتخاب آزمایشی/);
   assert.match(await page.locator('#details').innerText(),/دو آزمون رابط/);
   await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#history li').length>0);
   assert.match(await page.locator('#history').innerText(),/آزمون رابط/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.deepEqual(errors,[]);await page.close();
  }
  assert.equal(calls,2);console.log('UI_ONLY_DESKTOP_MOBILE_PASSED: injected runner, not real sandbox acceptance');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
