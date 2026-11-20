'use strict';
// Chromium executes the real UI. Only fixture generation talks to a loopback stub.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{once}=require('node:events');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(__dirname,'../../tests/browser/package.json'))('playwright');
const {benchmark}=require('./mana-format-bench.cjs');
const {createClearancePreview,COMMAND}=require('../src/pilot/mana-clearance-preview.cjs');
const {start}=require('../development-ui.cjs');
const exprs=['{"op":"add","args":[{"field":"first_mm"},{"field":"second_mm"}]}','add(first_mm,second_mm)','max(0,subtract(first_mm,second_mm))','{"op":"max","args":[{"value":0},{"op":"subtract","args":[{"field":"first_mm"},{"field":"second_mm"}]}]}','{"op":"max","args":[{"field":"first_mm"},{"field":"second_mm"}]}','max(first_mm,second_mm)'];
const close=s=>s.listening?new Promise(r=>s.close(r)):Promise.resolve();
(async()=>{
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'mana-clearance-browser-')),model='local-fixture-only';
 let requests=0,runs=0,server,browser;
 const stub=http.createServer(async(req,res)=>{for await(const _ of req){};res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:exprs[requests++]}}]}));});
 try{
  stub.listen(8794,'127.0.0.1');await once(stub,'listening');assert.equal((await benchmark({workspace,model})).status,'COMPLETE');assert.equal(requests,6);
  const before=Object.fromEntries(fs.readdirSync(workspace).map(name=>[name,fs.readFileSync(path.join(workspace,name))]));
  server=start({port:0,runner:{history:()=>[],run:async()=>{runs++;throw Error('Unexpected development runner');}},clearancePreview:createClearancePreview({workspace,model})});
  await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.MANA_CHROMIUM_EXECUTABLE?{executablePath:process.env.MANA_CHROMIUM_EXECUTABLE}:{})});
  for(const mobile of [true,false]){
   const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,locale:'fa-IR'});const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin);await page.locator('a[href="/mana"]').click();assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
   const input=page.locator('#text'),send=page.locator('#send');
   const submit=async()=>{const pending=page.waitForResponse(r=>r.url()===origin+'/mana/turn'&&r.request().method()==='POST');await send.click();const res=await pending;assert.equal(res.status(),200);const body=await res.json();await page.waitForFunction(()=>!document.getElementById('send').disabled);return body;};
   await page.getByRole('button',{name:'مقایسهٔ آزمایشی دو مقدار',exact:true}).click();assert.equal(await input.inputValue(),COMMAND);
   const r=await submit();assert.equal(r.status,'COMPLETED');assert.equal(r.modelCalls,0);assert.match(r.message,/۱۲۰۰/);assert.equal(await page.locator('#confirm').isVisible(),false);
   assert.match(await page.locator('#thread article').last().textContent(),/۱۲ از ۱۲/);
   await input.fill('بیشتر: ٧٥٠ و ٧٥٠ میلی متر');assert.match((await submit()).message,/هر دو مقدار برابرند/);
   await input.fill('بیشتر: ۱ و ۲ متر');assert.equal((await submit()).status,'CLARIFY');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);assert.deepEqual(errors,[]);
   await page.close();console.log('MANA_CLEARANCE_CHROMIUM_'+(mobile?'MOBILE':'DESKTOP')+'_PASSED (synthetic original receipt)');
  }
  assert.equal(runs,0);assert.equal(requests,6);assert.deepEqual(fs.readdirSync(workspace),Object.keys(before));
  for(const [name,bytes]of Object.entries(before))assert.deepEqual(fs.readFileSync(path.join(workspace,name)),bytes);
 }finally{if(browser)await browser.close();await close(server||{});await close(stub);fs.rmSync(workspace,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
