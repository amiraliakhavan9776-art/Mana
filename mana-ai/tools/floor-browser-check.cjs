'use strict';
// Browser → protected Persian staging endpoint → exact native arithmetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{once}=require('node:events');
const {chromium}=require('../../tests/browser/node_modules/playwright');
const {start}=require('../development-ui.cjs');
const {createDevelopmentRunner}=require('../src/development/runner.cjs');
const sample='مساحت خالص کف مستطیل، طول ۵ متر، عرض ۴ متر، مساحت کسرشده ۳ مترمربع';
const missing='مساحت خالص کف مستطیل، طول ۵، عرض ۴ متر، مساحت کسرشده ۳ مترمربع';
async function main(){
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'mana-floor-browser-'));
 const server=start({port:0,runner:createDevelopmentRunner({workspace})});
 let browser;
 try{
  await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.MANA_CHROMIUM_PATH?{executablePath:process.env.MANA_CHROMIUM_PATH}:{})});
  for(const [name,viewport,mobile] of [['mobile',{width:390,height:844},true],['desktop',{width:1280,height:900},false]]){
   const page=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile,locale:'fa-IR'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);await page.getByRole('link',{name:/مترهٔ دقیق کف/}).click();
   assert.match(page.url(),/\/floor$/);assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
   await page.locator('#sample').click();assert.equal(await page.locator('#request').inputValue(),sample);
   await page.locator('#calculate').click();await page.locator('#result').waitFor({state:'visible'});
   assert.match(await page.locator('#net').innerText(),/۱۷/);
   assert.match(await page.locator('#gross').innerText(),/۲۰/);
   assert.match(await page.locator('#excluded').innerText(),/۳/);
   await page.locator('#request').fill(missing);assert.equal(await page.locator('#result').isHidden(),true);
   await page.locator('#calculate').click();
   await page.waitForFunction(()=>/واحد/.test(document.getElementById('answer').textContent));
   assert.match(await page.locator('#answer').innerText(),/طول.*متر/);
   assert.equal(await page.locator('#result').isHidden(),true);
   await page.locator('#request').fill(sample);await page.locator('#calculate').click();
   await page.locator('#result').waitFor({state:'visible'});
   assert.match(await page.locator('#net').innerText(),/۱۷/);
   await page.reload();assert.equal(await page.locator('#result').isHidden(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.deepEqual(errors,[]);
   await page.close();console.log('FLOOR_REAL_CHROMIUM_'+name.toUpperCase()+'_PASSED');
  }
  assert.deepEqual(fs.readdirSync(workspace),[]);
 }finally{
  if(browser)await browser.close();
  if(server.listening)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(workspace,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
