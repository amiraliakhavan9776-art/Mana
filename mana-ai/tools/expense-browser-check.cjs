'use strict';
// Real expense UI -> protected HTTP -> native exact-decimal computation. No mocked expense result.
const {chromium}=require('../../tests/browser/node_modules/playwright');
const {start}=require('../development-ui.cjs');
const assert=require('node:assert/strict');
(async()=>{
 const server=start({port:0,runner:{history:()=>[],run:async()=>{throw Error('Mission runner not exercised by expense UI test');}}});
 await new Promise(r=>server.once('listening',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.MANA_CHROMIUM_PATH?{executablePath:process.env.MANA_CHROMIUM_PATH}:{})});
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
   const page=await browser.newPage({viewport,locale:'fa-IR'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.getByRole('link',{name:'بررسی صورت هزینه با درخواست فارسی'}).click();
   await page.locator('#sample').click();await page.locator('#review').click();
   await page.waitForFunction(()=>document.querySelector('#expense-status').textContent==='اختلاف در جمع اعلامی پیدا شد.');
   assert.match(await page.locator('#totals').innerText(),/15000.*14000.*1000/);assert.equal(await page.locator('#rows tr').count(),2);
   await page.locator('#declared').fill('15000');assert.equal(await page.locator('#report').isHidden(),true);await page.locator('#review').click();
   await page.waitForFunction(()=>document.querySelector('#expense-status').textContent==='جمع اعلامی با جمع ردیف‌ها برابر است.');
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);assert.equal(download.suggestedFilename(),'mana-expense-review.json');
   await page.locator('#file').setInputFiles({name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from('شرح,مبلغ\n"<script>alert(1)</script>",42\n')});
   await page.waitForFunction(()=>document.querySelector('#csv').value.includes('<script>'));
   await page.locator('#declared').fill('42');await page.locator('#review').click();await page.waitForFunction(()=>!document.querySelector('#report').hidden);
   assert.match(await page.locator('#rows').innerText(),/<script>alert\(1\)<\/script>/);assert.equal(await page.locator('#rows script').count(),0);
   await page.locator('#request').fill('وبسایت را باز کن');await page.locator('#review').click();await page.waitForFunction(()=>document.querySelector('#expense-status').textContent.includes('فقط درخواست'));
   assert.equal(await page.locator('#report').isHidden(),true);
   await page.locator('#clear').click();assert.equal(await page.locator('#csv').inputValue(),'');assert.equal(await page.locator('#report').isHidden(),true);
   await page.goBack();assert.equal(await page.locator('#run').count(),1);await page.goForward();assert.equal(await page.locator('#csv').inputValue(),'');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.close();
  }
  console.log('EXPENSE_REAL_HTTP_NATIVE_BROWSER_DESKTOP_MOBILE_PASSED');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
