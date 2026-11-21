'use strict';
// Real Chromium and real CPU worker in disposable CI, not a fixture success.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict'),{once}=require('node:events'),{createHash}=require('node:crypto');
const {chromium}=require('../../tests/browser/node_modules/playwright');
const {startQueueResearchPreview,HOLDOUT_SHA256}=require('../research-preview/runner.cjs');
const {readOfficial}=require('../research-preview/official-https.cjs');
const {PINS,REPOSITORY,COMMIT}=require('../research-preview/cpython-source.cjs');

const queueBytes=fs.readFileSync(path.resolve(__dirname,'../capability-registry/development-queue-v01.json'));
const holdoutPath=path.resolve(__dirname,'../research-preview/holdout.json');
const paths=Object.keys(PINS),missionId='88ab05d456850cd0';
const desktop={width:1280,height:900},mobile={width:390,height:844};
const start=config=>startQueueResearchPreview({queueBytes,holdoutPath,holdoutSha256:HOLDOUT_SHA256,...config,port:0});
const close=server=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
const terminal=(dir)=>path.join(dir,'terminal.json');
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const history=page=>page.locator('#history').innerText();

async function readyPage(browser,server,viewport){
 if(!server.listening)await once(server,'listening');
 const page=await browser.newPage({viewport,locale:'fa-IR'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 return {page,errors};
}
async function click(page){
 const [response]=await Promise.all([
  page.waitForResponse(r=>new URL(r.url()).pathname==='/run'&&r.request().method()==='POST',{timeout:50000}),
  page.getByRole('button',{name:'برو جلو',exact:true}).click(),
 ]);
 assert.equal(response.status(),200);
 return response.json();
}
function expectQueue(result){
 assert.equal(result.mission.id,missionId);
 assert.match(result.mission.title,/موتور پژوهش/u);
}
async function missing(browser,workspace){
 fs.mkdirSync(workspace,0o700);
 const calls=[];
 const server=start({workspace,sourceMode:'pinned-replay',readOfficial:async p=>{calls.push(p);throw Error('CAPTURE_UNAVAILABLE_IN_TEST');}});
 let page;
 try{
  const ready=await readyPage(browser,server,mobile);page=ready.page;
  assert.deepEqual(calls,[]);assert.deepEqual(fs.readdirSync(workspace),[]);
  const result=await click(page);
  expectQueue(result);assert.equal(result.status,'EXECUTION_BLOCKED');
  await page.waitForFunction(()=>document.querySelector('#details').textContent.includes('هیچ پیشنهادی ساخته نشد'));
  assert.deepEqual(calls,[paths[0]]);
  assert(!fs.existsSync(path.join(workspace,'worker')));
  assert.equal(readJson(terminal(workspace)).result.status,'RESEARCH_BLOCKED');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#history').textContent.includes('اجرای آزمون متوقف شد'));
  const replay=await click(page);assert.equal(replay.reused,true);
  assert.deepEqual(calls,[paths[0]]);assert.deepEqual(ready.errors,[]);
  console.log('MANA_RESEARCH_CHROMIUM_MISSING_SOURCE_PASSED');
 }finally{try{await page?.close();}finally{await close(server);}}
}
async function official(browser,workspace){
 fs.mkdirSync(workspace,0o700);
 const calls=[],failures=[];
 const config={workspace,sourceMode:'official-https',readOfficial:async p=>{
  calls.push(p);
  try{return await readOfficial(p);}catch(e){failures.push(e.code??e.message);throw e;}
 }};
 let server=start(config),page,original,stored,source;
 try{
  const ready=await readyPage(browser,server,desktop);page=ready.page;
  assert.deepEqual(calls,[]);assert.deepEqual(fs.readdirSync(workspace),[]);
  original=await click(page);
  expectQueue(original);
  assert.equal(original.status,'REVIEW_REQUIRED','Official proof did not reach review: '+(failures.length?failures.join(', '):original.reason));
  assert.match(original.selectedBecause,/۸۴ مأموریت.*یک آزمون محدود/u);
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='نیازمند بازبینی');
  const details=await page.locator('#details').innerText();
  assert.match(details,/موتور پژوهش/u);
  assert.match(details,/بند ۳٫۵/u);
  assert.match(details,/دریافت محدود از ناشر روی HTTPS/u);
  assert.match(details,/آزمون مستقل روی CPU: ۱۶ از ۱۶/u);
  assert.match(details,/قابلیت فعال نشده است/u);
  assert(details.includes('https://github.com/'+REPOSITORY+'/blob/'+COMMIT+'/'+paths.at(-1)));
  assert.deepEqual(calls,paths);
  assert.deepEqual(ready.errors,[]);
  stored=fs.readFileSync(terminal(workspace));
  source=readJson(path.join(workspace,'source-provenance.json'));
  assert.equal(source.sourceMode,'official-https');
  assert.equal(source.transport,'OFFICIAL_CPYTHON_HTTPS');
  assert.equal(source.directRuntimeNetwork,true);
  assert.deepEqual(source.captures.map(x=>x.path),paths);
  const saved=readJson(terminal(workspace)).result;
  assert.equal(saved.sourceProvenanceSha256,createHash('sha256').update(fs.readFileSync(path.join(workspace,'source-provenance.json'))).digest('hex'));
  assert.equal(saved.sourceMode,'official-https');
  assert.equal(saved.status,'AWAITING_HUMAN_REVIEW');assert.equal(saved.passed,16);assert.equal(saved.total,16);
  const grade=readJson(path.join(workspace,'worker','learner','grade.json'));
  assert.equal(grade.activationAuthorized,false);assert.equal(grade.modelCalls,0);
 }finally{try{await page?.close();}finally{await close(server);}}
 // Same state, new application instance and fresh mobile browser context.
 server=start(config);page=undefined;
 try{
  const ready=await readyPage(browser,server,mobile);page=ready.page;
  await page.waitForFunction(()=>document.querySelector('#history').textContent.includes('نیازمند بازبینی'));
  assert.match(await history(page),/موتور پژوهش/u);
  assert.deepEqual(calls,paths);
  const result=await click(page);expectQueue(result);
  assert.equal(result.status,'REVIEW_REQUIRED');assert.equal(result.reused,true);assert.equal(result.output,original.output);
  await page.waitForFunction(()=>document.querySelector('#details').textContent.includes('رسید قبلی استفاده شد'));
  assert.deepEqual(fs.readFileSync(terminal(workspace)),stored);
  assert.deepEqual(readJson(path.join(workspace,'source-provenance.json')),source);
  assert.deepEqual(calls,paths);assert.deepEqual(ready.errors,[]);
  console.log('MANA_RESEARCH_CHROMIUM_OFFICIAL_HTTPS_16_OF_16_REVIEW_ONLY_PASSED');
 }finally{try{await page?.close();}finally{await close(server);}}
}
(async()=>{
 let browser;
 const d=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mana-research-chromium-')));
 try{
  // The existing browser workflow launches Playwright in a disposable hosted
  // GitHub runner. Elsewhere require Chromium's own sandbox; no local fallback.
  const hostedCi=process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_ENVIRONMENT==='github-hosted';
  browser=await chromium.launch({headless:true,chromiumSandbox:!hostedCi,...(process.env.MANA_CHROMIUM_PATH?{executablePath:process.env.MANA_CHROMIUM_PATH}:{})});
  await missing(browser,path.join(d,'missing'));
  await official(browser,path.join(d,'official'));
 }finally{try{await browser?.close();}finally{fs.rmSync(d,{recursive:true,force:true});}}
})().catch(e=>{console.error(e);process.exitCode=1;});
