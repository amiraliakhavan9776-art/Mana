'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {reviewExpense,parseCSV,sample}=require('../src/pilot/expense-review.cjs');
const {start}=require('../development-ui.cjs');
const input={request:'جمع هزینه‌ها را بررسی کن',csv:sample,currency:'IRR',declaredTotal:'۱۴۰۰۰'};
test('expense sample exact total and discrepancy retain source rows and unverified scope',()=>{
 const r=reviewExpense(input);assert.equal(r.calculatedTotal,'15000');assert.equal(r.difference,'1000');assert.equal(r.status,'TOTAL_MISMATCH');assert.deepEqual(r.rows.map(x=>x.sourceLine),[2,3]);assert.equal(r.productionPostingAllowed,false);assert.match(r.scope,/تأیید نشده/);assert.equal(r.sourceSha256.length,64);
});
test('expense arithmetic remains exact above Number safe range, no implicit unit conversion',()=>{
 const r=reviewExpense({...input,csv:'شرح,مبلغ\nالف,999999999999999999999999\nب,1',currency:'TOMAN',declaredTotal:'0'});assert.equal(r.calculatedTotal,'1000000000000000000000000');assert.equal(r.currency,'TOMAN');
 assert.equal(reviewExpense({...input,declaredTotal:'١٥٠٠٠'}).status,'TOTAL_MATCH');
 assert.equal(reviewExpense({...input,declaredTotal:'16000'}).difference,'-1000');
});
test('CSV handles BOM CRLF quotes and multiline physical source references',()=>{
 const rows=parseCSV('\uFEFFdescription,amount\r\n"الف, ب\nج ""د""",12\r\nبعدی,0\r\n');assert.equal(rows[0].description,'الف, ب\nج "د"');assert.deepEqual(rows.map(x=>[x.sourceLine,x.sourceEndLine]),[[2,3],[4,4]]);
});
test('similar rows counted and flagged; formula-looking text never executed',()=>{
 const r=reviewExpense({...input,csv:'شرح,مبلغ\n=RUN(),1\n=RUN(),1',declaredTotal:'2'});assert.equal(r.calculatedTotal,'2');assert.deepEqual(r.duplicates,[[2,3]]);assert.equal(r.rows[0].description,'=RUN()');
});
test('reject unsupported intent, unit and malformed amount without fabricated result',()=>{
 for(const delta of [{request:'وبسایت را باز کن'},{currency:''},{currency:'USD'},{declaredTotal:''},{declaredTotal:0},{csv:'شرح,مبلغ\nالف,1e3'},{csv:'شرح,مبلغ\nالف,-1'},{csv:'شرح,مبلغ\nالف,0.1'},{csv:'شرح,مبلغ\nالف,"1,000"'},{csv:'شرح,مبلغ\nالف,۱٬۰۰۰'},{csv:'شرح,مبلغ\nالف,01'},{csv:'شرح,مبلغ\nالف,NaN'},{csv:'شرح,مبلغ\nالف,1234567890123456789012345'},{unexpected:true}])assert.throws(()=>reviewExpense({...input,...delta}));
});
test('CSV rejects structural ambiguity and oversized inputs',()=>{
 for(const csv of ['description|amount\nitem,1','شرح|مبلغ\nالف,1','شرح,مبلغ','شرح,مبلغ\nالف,1,IRR','شرح,شرح\nالف,1','شرح,مبلغ\n"الف,1','شرح,مبلغ\n"الف"x,1','شرح,مبلغ\n,1','شرح,مبلغ\nجمع کل,50','x'.repeat(100001),'شرح,مبلغ\n'+Array(501).fill('الف,1').join('\n')])assert.throws(()=>parseCSV(csv));
});
test('source hash changes with source bytes without normalization hiding input',()=>{
 assert.notEqual(reviewExpense(input).sourceSha256,reviewExpense({...input,csv:sample+'\n'}).sourceSha256);
});
test('expense protected HTTP route, old mission route, errors and repeated inputs',async()=>{
 let runs=0;const server=start({port:0,runner:{history:()=>[],run:async()=>({status:'BENCHMARK_PASSED',run:++runs})}});await new Promise(r=>server.once('listening',r));
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  const html=await (await fetch(origin+'/expenses')).text();const token=html.match(/'X-Mana-Token':'([a-f0-9]+)'/)[1];
  const headers={'Content-Type':'application/json','X-Mana-Token':token,Origin:origin};
  assert.match(await(await fetch(origin)).text(),/href="\/expenses"/);
  assert.equal((await fetch(origin+'/expenses/review',{method:'POST',headers:{...headers,Origin:'http://evil.invalid'},body:JSON.stringify(input)})).status,403);
  assert.equal((await fetch(origin+'/expenses/review',{method:'POST',headers:{...headers,'X-Mana-Token':'bad'},body:JSON.stringify(input)})).status,403);
  assert.equal((await fetch(origin+'/expenses/review',{method:'POST',headers,body:'{'})).status,400);
  for(let i=0;i<2;i++){const res=await fetch(origin+'/expenses/review',{method:'POST',headers,body:JSON.stringify(input)});assert.equal(res.status,200);assert.equal((await res.json()).calculatedTotal,'15000');}
  const run=await fetch(origin+'/run',{method:'POST',headers:{Origin:origin,'X-Mana-Token':token}});assert.equal(run.status,200);assert.equal(runs,1);
 }finally{await new Promise(r=>server.close(r));}
});

function uiHarness(){
 const vm=require('node:vm'),{expensePage}=require('../src/pilot/expense-page.cjs');
 const nodes=new Map();const node=()=>({value:'',hidden:true,disabled:false,textContent:'',children:[],listeners:{},files:[],addEventListener(k,fn){this.listeners[k]=fn;},replaceChildren(){this.children=[];},append(x){this.children.push(x);},click(){},reset(){}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 let requests=0,downloads=0;
 const context={document:{getElementById:get,createElement:node},AbortController,TextDecoder,Blob,setTimeout:()=>{},URL:{createObjectURL(){downloads++;return 'blob:test';},revokeObjectURL(){}},fetch:async(url,options)=>{requests++;return {ok:true,json:async()=>reviewExpense(JSON.parse(options.body))};}};
 vm.runInNewContext(expensePage('0'.repeat(64)).match(/<script>([\s\S]*)<\/script>/)[1],context);
 return {get,requests:()=>requests,downloads:()=>downloads,submit:()=>get('expense-form').onsubmit({preventDefault(){}})};
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const bytes=s=>new TextEncoder().encode(s).buffer;
test('actual inline sample is valid CSV and file selection invalidates previous report/download',async()=>{
 const ui=uiHarness();ui.get('sample').onclick();assert.equal(ui.get('csv').value,sample);await ui.submit();assert.equal(ui.get('report').hidden,false);ui.get('download').onclick();assert.equal(ui.downloads(),1);
 const pending=deferred();ui.get('file').files=[{size:20,arrayBuffer:()=>pending.promise}];const load=ui.get('file').onchange();
 assert.equal(ui.get('csv').value,'');assert.equal(ui.get('review').disabled,true);assert.equal(ui.get('report').hidden,true);ui.get('download').onclick();assert.equal(ui.downloads(),1);
 await ui.submit();assert.equal(ui.requests(),1);ui.get('declared').listeners.input();assert.equal(ui.get('review').disabled,true);
 pending.resolve(bytes('شرح,مبلغ\nجدید,42'));await load;assert.equal(ui.get('csv').value,'شرح,مبلغ\nجدید,42');assert.equal(ui.get('review').disabled,false);
});
test('failed file cannot review stale source; manual edit explicitly recovers',async()=>{
 const ui=uiHarness();ui.get('sample').onclick();await ui.submit();
 for(const file of [{size:100001,arrayBuffer:async()=>bytes('bad')},{size:1,arrayBuffer:async()=>new Uint8Array([255]).buffer}]){
  ui.get('file').files=[file];await ui.get('file').onchange();assert.equal(ui.get('csv').value,'');assert.equal(ui.get('review').disabled,true);await ui.submit();assert.equal(ui.requests(),1);assert.equal(ui.get('report').hidden,true);
 }
 ui.get('csv').value=sample;ui.get('csv').listeners.input();assert.equal(ui.get('file').value,'');assert.equal(ui.get('review').disabled,false);await ui.submit();assert.equal(ui.requests(),2);
});
test('out-of-order file reads cannot replace latest file or explicit manual source',async()=>{
 const ui=uiHarness(),old=deferred(),latest=deferred();
 ui.get('file').files=[{size:20,arrayBuffer:()=>old.promise}];const first=ui.get('file').onchange();
 ui.get('file').files=[{size:20,arrayBuffer:()=>latest.promise}];const second=ui.get('file').onchange();latest.resolve(bytes('شرح,مبلغ\nجدید,2'));await second;old.resolve(bytes('شرح,مبلغ\nقدیم,1'));await first;assert.equal(ui.get('csv').value,'شرح,مبلغ\nجدید,2');
 const slow=deferred();ui.get('file').files=[{size:20,arrayBuffer:()=>slow.promise}];const third=ui.get('file').onchange();ui.get('sample').onclick();slow.resolve(bytes('شرح,مبلغ\nقدیم,3'));await third;assert.equal(ui.get('csv').value,sample);assert.equal(ui.get('review').disabled,false);
});
