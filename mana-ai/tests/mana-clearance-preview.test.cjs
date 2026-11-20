'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{once}=require('node:events'),{createHash}=require('node:crypto');
const {benchmark}=require('../tools/mana-format-bench.cjs');
const {createClearancePreview,COMMAND}=require('../src/pilot/mana-clearance-preview.cjs');
const {start}=require('../development-ui.cjs');
const model='clearance-preview-mock';
const old=['{"op":"add","args":[{"field":"first_mm"},{"field":"second_mm"}]}','add(first_mm,second_mm)','max(0,subtract(first_mm,second_mm))','{"op":"max","args":[{"value":0},{"op":"subtract","args":[{"field":"first_mm"},{"field":"second_mm"}]}]}','{"op":"max","args":[{"field":"first_mm"},{"field":"second_mm"}]}','max(first_mm,second_mm)'];
const hash=b=>createHash('sha256').update(b).digest('hex');
function dir(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'mana-clearance-fixture-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
function evidence(d){return Object.fromEntries(fs.readdirSync(d).map(n=>[n,hash(fs.readFileSync(path.join(d,n)))]));}
async function syntheticReceipt(t){
 const workspace=dir(t);let calls=0;
 const provider=http.createServer(async(req,res)=>{for await(const _ of req){};res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:old[calls++]}}]}));});
 provider.listen(8794,'127.0.0.1');await once(provider,'listening');t.after(()=>new Promise(r=>provider.close(r)));
 const r=await benchmark({workspace,model});assert.equal(r.status,'COMPLETE');assert.equal(r.results[5].status,'PASSED');assert.equal(calls,6);
 return {workspace,model,calls:()=>calls};
}
test('missing receipt and wrong unit/decimal/range fail without writes or provider call',async t=>{
 const workspace=dir(t),p=createClearancePreview({workspace,model});assert.ok(p.matches(COMMAND));
 for(const s of ['بیشتر: ۱٫۲ و ۷۵۰ میلی‌متر','بیشتر: ۱۲۰۰ و ۷۵۰ متر','بیشتر: ۱۲۰۰ و ۷۵۰','بیشتر: ۱۰۰۰۰۱ و ۲ میلی‌متر','بیشتر: -۱ و ۲ میلی‌متر','بیشتر: 1e3 و 1 میلی متر','بیشتر: 1,000 و 1 میلی‌متر'])assert.equal((await p.preview(s)).status,'CLARIFY',s);
 assert.equal((await p.preview(COMMAND)).status,'BLOCKED');assert.deepEqual(fs.readdirSync(workspace),[]);
});
test('exact historical receipt replays and renders result without network, persistence, fallback or approvals',async t=>{
 const old=await syntheticReceipt(t),before=evidence(old.workspace),preview=createClearancePreview(old);
 const r=await preview.preview(COMMAND);assert.equal(r.status,'COMPLETED');assert.match(r.message,/۱۲۰۰ میلی‌متر/);assert.match(r.details,/۱۲ از ۱۲/);assert.match(r.details,new RegExp(before['receipt.json']));assert.equal(r.modelCalls,0);assert.equal(r.activated,false);
 const tie=await preview.preview('بیشتر: ٧٥٠ و ٧٥٠ میلی متر');assert.match(tie.message,/هر دو مقدار برابرند: ۷۵۰/);
 assert.equal((await createClearancePreview({workspace:old.workspace,model:'wrong-model'}).preview(COMMAND)).status,'BLOCKED');
 assert.deepEqual(evidence(old.workspace),before);assert.equal(old.calls(),6);
 const file=path.join(old.workspace,'cell-06.json'),doc=JSON.parse(fs.readFileSync(file));doc.result.candidate.args.reverse();fs.writeFileSync(file,JSON.stringify(doc));assert.equal((await preview.preview(COMMAND)).status,'BLOCKED');assert.equal(old.calls(),6);
});
test('existing protected /mana delivers real comparator after verified evidence, no runner/model call',async t=>{
 const old=await syntheticReceipt(t),orig=evidence(old.workspace);let runs=0;
 const clearancePreview=createClearancePreview(old),runner={run:async()=>{runs++;throw Error('Unexpected run');},history:()=>[]};
 assert.throws(()=>start({runner,clearancePreview,manaAnswerText:async()=>{throw Error('Unexpected model');}}),/without model/);
 const s=start({port:0,runner,clearancePreview});await once(s,'listening');t.after(()=>new Promise(r=>s.close(r)));const base='http://127.0.0.1:'+s.address().port;
 const page=await(await fetch(base+'/mana')).text();assert.match(page,/مقایسهٔ آزمایشی دو مقدار/);const token=page.match(/[a-f0-9]{64}/)[0],session=page.replace(token,'').match(/[a-f0-9]{32}/)[0];
 const post=(text,origin=base)=>fetch(base+'/mana/turn',{method:'POST',headers:{Origin:origin,'X-Mana-Token':token,'Content-Type':'application/json'},body:JSON.stringify({action:'message',session,text})});
 assert.equal((await post(COMMAND,'http://invalid.example')).status,403);
 const response=await post(COMMAND);assert.equal(response.headers.get('cache-control'),'no-store');
 const r=await response.json();assert.equal(r.status,'COMPLETED');assert.equal(r.confirmation,undefined);assert.match(r.message,/۱۲۰۰/);
 assert.equal((await(await post('گفت‌وگو: آیا اینترنت لازم است؟')).json()).status,'BLOCKED');
 assert.equal(runs,0);assert.equal(old.calls(),6);assert.deepEqual(evidence(old.workspace),orig);
});
