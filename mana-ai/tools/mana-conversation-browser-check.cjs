'use strict';
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {chromium}=require('../../tests/browser/node_modules/playwright');
const {start}=require('../development-ui.cjs');
(async()=>{
 let calls=0;const rows=[],server=start({port:0,runner:{
  history:()=>rows,
  run:async()=>{calls++;const result={status:'BENCHMARK_PASSED',mission:{title:'آزمون کنترل‌شدهٔ رابط'},selectedBecause:'معیار انتخاب آزمایشی',reason:'مدرک نتیجهٔ آزمایشی'};rows.push({title:result.mission.title,status:result.status});return result;}
 }});
 await once(server,'listening');let browser;
 try{
  browser=await chromium.launch({headless:true});
  for(const mobile of [true,false]){
   const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,locale:'fa-IR'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.locator('a[href="/mana"]').click();
   assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
   const send=async(text)=>{const resp=page.waitForResponse(r=>r.url().endsWith('/mana/turn'));await page.locator('#text').fill(text);await page.locator('#send').click();const data=await (await resp).json();await page.waitForFunction(()=>!document.getElementById('send').disabled);return data;};
   const floor=await send('مساحت خالص کف مستطیل، طول ۵ متر، عرض ۴ متر، مساحت کسرشده ۳ مترمربع');
   assert.equal(floor.status,'COMPLETED');
   assert.match(await page.locator('#thread article').last().textContent(),/[۱1][۷7]/);
   const missing=await send('مساحت خالص کف مستطیل، طول ۵، عرض ۴ متر، مساحت کسرشده ۳ مترمربع');
   assert.equal(missing.status,'CLARIFY');
   const oneMissing=await send('مساحت خالص کف مستطیل، عرض ۴ متر، مساحت کسرشده ۳ مترمربع');
   assert.equal(oneMissing.status,'CLARIFY');
   const followup=await send('طول ۵ متر');
   assert.equal(followup.status,'COMPLETED');
   assert.match(await page.locator('#thread article').last().textContent(),/[۱1][۷7]/);
   const nativeCalls=calls;
   await page.getByRole('button',{name:'مترهٔ قرنیز',exact:true}).click();
   const skirtingInput=await page.locator('#text').inputValue();
   assert.equal(skirtingInput,'قرنیز: طول ۵ متر، عرض ۴ متر، کسر ۰٫۹ متر');
   const skirting=await send(skirtingInput);
   assert.equal(skirting.status,'COMPLETED');assert.equal(skirting.takeoff.net_skirting_m,'17.1');assert.equal(skirting.modelCalls,0);
   assert.match(await page.locator('#thread article').last().textContent(),/۱۷٫۱.*۱۸.*۰٫۹/);
   assert.equal(await page.locator('#confirm').isVisible(),false);
   const invalidSkirting=await send('قرنیز: طول ۵ متر، عرض ۴ متر، کسر ۱۹ متر');
   assert.equal(invalidSkirting.status,'CLARIFY');assert.equal(invalidSkirting.takeoff,undefined);
   assert.match(await page.locator('#thread article').last().textContent(),/از محیط بیشتر/);
   assert.equal(calls,nativeCalls);
   const prev=calls;
   const preview=await send('برو جلو');
   assert.equal(preview.status,'CONFIRM_REQUIRED');
   assert.equal(calls,prev);
   assert.equal(await page.locator('#confirm').isVisible(),true);
   await page.locator('#confirm').click();
   await page.waitForFunction(()=>!document.getElementById('send').disabled);
   assert.equal(calls,prev+1);
   assert.match(await page.locator('#thread article').last().textContent(),/مدرک نتیجهٔ آزمایشی/);
   assert.equal(await page.locator('#confirm').isVisible(),false);
   await page.locator('#reset').click();
   await page.waitForFunction(()=>!document.getElementById('send').disabled);
   assert.equal(await page.locator('#thread article.human').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
   assert.deepEqual(errors,[]);await page.close();
   console.log('MANA_CONVERSATION_CHROMIUM_'+(mobile?'MOBILE':'DESKTOP')+'_PASSED (native floor and skirting, injected mission runner)');
  }
 }finally{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
