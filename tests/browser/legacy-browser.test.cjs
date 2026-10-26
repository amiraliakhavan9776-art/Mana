'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.MANA_PLAYWRIGHT_MODULE || 'playwright');
const {createLegacyBackup,verifyLegacyBackup}=require('../../mana-ai/src/legacy-backup.cjs');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'));
async function browserFixture(run){
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({locale:'fa-IR'}),page=await context.newPage();
  // Test data and local origin only; optional external integrations are denied.
  const base='http://127.0.0.1:'+server.address().port;
  await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'ناظر آزمایشی':undefined));
  await page.goto(base+'/#/projects');
  await page.waitForFunction(()=>typeof DB==='object' && DB && typeof save==='function');
  await run(page,base);
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
test('RTL project UI creates, edits and reloads a synthetic project', {timeout:60000},()=>browserFixture(async(page,base)=>{
 assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
 await page.locator('[data-act="prj-new"]').first().click();
 await page.locator('#overlay input[name="name"]').fill('پروژهٔ رگرسیون');
 await page.locator('#overlay input[name="budget"]').fill('1200000');
 await page.locator('[data-act="prj-save"]').click();
 await page.waitForFunction(()=>DB.projects.some(p=>p.name==='پروژهٔ رگرسیون'));
 const id=await page.evaluate(()=>DB.projects.find(p=>p.name==='پروژهٔ رگرسیون').id);
 await page.locator('[data-act="prj-edit"][data-id="'+id+'"]').click();
 await page.locator('#overlay input[name="name"]').fill('پروژهٔ ویرایش‌شده');
 await page.locator('[data-act="prj-save"]').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('mana.db.v2'))?.projects?.some(p=>p.name==='پروژهٔ ویرایش‌شده'));
 await page.reload();
 assert.equal(await page.evaluate(id=>DB.projects.find(p=>p.id===id).budget,id),1200000);
 assert.equal(await page.evaluate(id=>DB.projects.find(p=>p.id===id).name,id),'پروژهٔ ویرایش‌شده');
 for(const route of ['dashboard','contracts','invoices','pettycash','cashflow','approvals','settings']){
  await page.goto(base+'/#/'+route);
  await page.waitForFunction(()=>document.querySelector('#view')?.textContent.trim().length>0);
  assert.doesNotMatch(await page.locator('#view').innerText(),/خطا در نمایش|صفحه یافت نشد/);
 }
}));
test('legacy invoice approval state transitions persist and reverse', {timeout:60000},()=>browserFixture(async(page)=>{
 // Invoke the registered real UI handlers with synthetic records; the authenticated server
 // approval system is separate and remains disabled for consequential writes.
 await page.evaluate(()=>{
  const project=DB.projects[0];
  DB.invoices.push({id:'regression-invoice',projectId:project.id,no:'TEST',date:'2026-10-26',status:'draft',items:[],payments:[]});
  ACT['inv-submit-for-approval']({dataset:{id:'regression-invoice'}});
 });
 assert.equal(await page.evaluate(()=>DB.invoices.find(i=>i.id==='regression-invoice').status),'pending');
 await page.evaluate(()=>ACT['inv-approve']({dataset:{id:'regression-invoice'}}));
 assert.equal(await page.evaluate(()=>DB.invoices.find(i=>i.id==='regression-invoice').status),'approved');
 await page.evaluate(()=>ACT['inv-unapprove']({dataset:{id:'regression-invoice'}}));
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('mana.db.v2'))?.invoices?.some(i=>i.id==='regression-invoice'&&i.status==='pending'));
 await page.reload();
 assert.equal(await page.evaluate(()=>DB.invoices.find(i=>i.id==='regression-invoice').status),'pending');
}));

test('approval reversal persists zero automatic progress and preserves manual activity progress', {timeout:60000},()=>browserFixture(async(page)=>{
 await page.evaluate(()=>{
  DB.projects=[{id:'approval-project',activities:[{id:'auto',dur:10,progress:0},{id:'manual',dur:10,progress:25}]}];
  DB.activityMaterials=[{id:'material',projectId:'approval-project',activityId:'auto',name:'concrete',planned:10,consumed:0}];
  DB.invoices=[{id:'effects-invoice',projectId:'approval-project',status:'pending',items:[{activityId:'auto',materialId:'material',qty:5,price:100}]}];
  ACT['inv-approve']({dataset:{id:'effects-invoice'}});
 });
 assert.equal(await page.evaluate(()=>DB.projects[0].activities[0].progress),50);
 assert.equal(await page.evaluate(()=>DB.projects[0].progress),37.5);
 await page.evaluate(()=>ACT['inv-unapprove']({dataset:{id:'effects-invoice'}}));
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('mana.db.v2'))?.projects?.[0]?.activities?.[0]?.progress===0);
 await page.reload();
 const values=await page.evaluate(()=>({automatic:DB.projects[0].activities[0].progress,manual:DB.projects[0].activities[1].progress,total:DB.projects[0].progress,consumed:DB.activityMaterials[0].consumed,cost:window.ManaActMat.costFor('approval-project','auto')}));
 assert.deepEqual(values,{automatic:0,manual:25,total:12.5,consumed:0,cost:0});
}));

test('final settlement renders with an invoice and preserves paid totals', {timeout:60000},()=>browserFixture(async(page,base)=>{
 await page.evaluate(()=>{
  const project=DB.projects[0];
  DB.invoices.push({id:'settlement-invoice',projectId:project.id,status:'pending',items:[{qty:2,price:1000}],payments:[{amount:600}]});
  save(true);
 });
 await page.goto(base+'/#/settlement');
 await page.waitForFunction(()=>document.querySelector('#pageTitle')?.textContent.includes('تسویه'));
 assert.doesNotMatch(await page.locator('#view').innerText(),/خطا در نمایش/);
 const result=await page.evaluate(()=>window.ManaFinalSettlement.calculate(DB.projects[0].id));
 assert.equal(result.invoicePaid,600);assert.equal(result.invoiceGross,2000);
}));

test('encrypted backup round-trip includes real browser IndexedDB attachments', {timeout:60000},()=>browserFixture(async(page)=>{
 const snapshot=await page.evaluate(async()=>{
  const ownerKey='project:'+DB.projects[0].id;
  const attachment=await window.ManaAttach.db.save(ownerKey,new File(['synthetic attachment'],'test.txt',{type:'text/plain'}));
  return {databaseJson:JSON.stringify(DB),attachments:[attachment]};
 });
 const key=Buffer.alloc(32,12),restored=verifyLegacyBackup(createLegacyBackup(snapshot,key),key);
 assert.equal(restored.databaseJson,snapshot.databaseJson);
 assert.deepEqual(restored.attachments,snapshot.attachments);
 await page.evaluate(async restored=>{
  DB=JSON.parse(restored.databaseJson);save(true);
  await new Promise((resolve,reject)=>{
   const request=indexedDB.open('mana-attach',1);
   request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{
    const db=request.result,tx=db.transaction('files','readwrite'),store=tx.objectStore('files');
    store.clear();for(const attachment of restored.attachments)store.put(attachment);
    tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)};
   };
  });
 },restored);
 await page.reload();
 const actual=await page.evaluate(async ownerKey=>window.ManaAttach.db.byOwner(ownerKey),restored.attachments[0].ownerKey);
 assert.deepEqual(actual,restored.attachments);
}));
