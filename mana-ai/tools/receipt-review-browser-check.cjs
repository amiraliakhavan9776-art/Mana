'use strict';
// Browser-only fixture. Receipt verification is exercised separately by Node tests.
const assert=require('node:assert/strict'),{once}=require('node:events');
const {chromium}=require('../../tests/browser/node_modules/playwright');
const {start}=require('../research-preview/aec-instruction-preview.cjs');
const {supportsMissionSelectionInstruction}=require('../research-preview/mission-selection-runner.cjs');
const receipt=Object.freeze({
 receiptReview:true,status:'AWAITING_HUMAN_REVIEW',missionId:'6d213a1b0d0b2a93',title:'مترهٔ سطح ناخالص قطعهٔ ذوزنقه‌ای',
 selectedBecause:'در این آزمون مرورگر، رسید قبلی همین ردیف نمایش داده می‌شود.',
 sourceUrl:'https://www.grc.nasa.gov/www/k-12/airplane/area.html',sourceMode:'direct',
 sourceSha256:'1'.repeat(64),indexSha256:'2'.repeat(64),evidenceSha256:'3'.repeat(64),gradeSha256:'4'.repeat(64),
 candidateSha256:'5'.repeat(64),passed:16,total:16,reviewedCount:2,validatedCount:2,reused:true,activationAuthorized:false,
});
async function run(browser,viewport,{missing=false}={}){
 let clicks=0;
 const value=missing?{receiptReview:true,status:'RECEIPT_UNVERIFIED',validatedCount:1,reviewedCount:2,
  selectedBecause:'رسید قابل‌تأیید نیست؛ آزمون دوباره اجرا نمی‌شود.'}:receipt;
 const runner={history:()=>value,run(command){
  clicks++;
  return supportsMissionSelectionInstruction(command)?value:{status:'REJECTED'};
 }};
 const server=start({runner,missionSelection:true,receiptReview:true});
 let page;
 try{
  if(!server.listening)await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  page=await browser.newPage({viewport,locale:'fa-IR'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const outside=[];
  await page.route('**/*',r=>{
   if(new URL(r.request().url()).origin!==origin){outside.push(r.request().url());return r.abort();}
   return r.continue();
  });
  await page.goto(origin+'/');
  assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
  const check=()=>page.waitForFunction(({missing,url})=>{
   const s=document.querySelector('#status').textContent,d=document.querySelector('#details').textContent;
   return missing?s.includes('رسید')&&d.includes('قابل‌تأیید نیست'):
    s.includes('بازبینی')&&d.includes(url)&&d.includes('۱۶ از ۱۶')&&d.includes('شناسه');
  },{missing,url:receipt.sourceUrl});
  await check();
  assert.equal(clicks,0,'GET /history must not invoke run');
  const press=async()=>{
   const [res]=await Promise.all([page.waitForResponse(r=>r.url()===origin+'/run'&&r.request().method()==='POST'),
    page.getByRole('button',{name:'برو جلو',exact:true}).click()]);
   assert.equal(res.status(),200);return res.json();
  };
  assert.equal((await press()).status,value.status);
  await check();
  await page.reload();await check();
  assert.equal(clicks,1,'reloading must not invoke run');
  if(!missing){
   assert.equal((await press()).candidateSha256,receipt.candidateSha256);
   await page.locator('#instruction').fill('دستور خارج از محدوده');
   assert.equal((await press()).status,'REJECTED');
   await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('خارج از محدوده'));
  }
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 }finally{
  if(page)await page.close();
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 }
}
(async()=>{
 const hosted=process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_ENVIRONMENT==='github-hosted';
 const browser=await chromium.launch({headless:true,chromiumSandbox:!hosted});
 try{
  await run(browser,{width:1280,height:900});
  await run(browser,{width:390,height:844});
  await run(browser,{width:390,height:844},{missing:true});
 }finally{await browser.close();}
 console.log('MANA_PERSIAN_READ_ONLY_RECEIPT_BROWSER_FIXTURE_PASSED');
})().catch(e=>{console.error(e);process.exitCode=1;});
