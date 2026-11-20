'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events');
const {calculateSkirtingTakeoff:c}=require('../src/native/skirting-takeoff.cjs');
const {COMMAND,previewSkirting,matchesSkirting}=require('../src/pilot/mana-skirting-preview.cjs');
const {start}=require('../development-ui.cjs');
const takeoff=(length_m,width_m,excluded_length_m)=>c({length_m,width_m,excluded_length_m});
const fmt=n=>[Math.floor(n/1000),String(n%1000).padStart(3,'0')].join('.');
test('reviewed sample and exact millimetre precision, equality, zero deductions and bounds',()=>{
 const r=takeoff('5','4','0.900');assert.equal(r.unit,'m');assert.equal(r.gross_perimeter_m,'18');assert.equal(r.excluded_length_m,'0.9');assert.equal(r.net_skirting_m,'17.1');assert.equal(r.geometry.type,'user_entered_internal_rectangle');assert.equal(r.modelCalls,0);
 assert.equal(takeoff('0.100','0.200','0.001').net_skirting_m,'0.599');
 assert.equal(takeoff('0.001','0.001','0.004').net_skirting_m,'0');
 assert.equal(takeoff('100','100','400').net_skirting_m,'0');
 assert.equal(takeoff('100','100','0').net_skirting_m,'400');
 for(let x=1;x<450;x+=19)for(let y=1;y<350;y+=13){const gross=2*x+2*y,d=Math.floor(gross/3);const r=takeoff(fmt(x),fmt(y),fmt(d));assert.equal(r.net_skirting_m,fmt(gross-d).replace(/0+$/,'').replace(/\.$/,''));}
});
test('strict native contract excludes nonpositive or oversized dimensions, excess deduction, getters and ambiguous decimal strings',()=>{
 for(const args of [['0','4','0'],['100.001','1','0']])assert.throws(()=>takeoff(...args),e=>e.code==='DIMENSION_OUT_OF_RANGE');
 for(const args of [['5','4','18.001'],['100','100','401']])assert.throws(()=>takeoff(...args),e=>e.code==='DEDUCTION_EXCEEDS_PERIMETER');
 for(const x of [null,1,'01','-1','+1',' 1','1e2','1.0001','1,0','1\n'])assert.throws(()=>takeoff(x,'1','0'),e=>e.code==='INVALID_DECIMAL');
 const getter={get length_m(){throw Error('getter executed');},width_m:'1',excluded_length_m:'0'};assert.throws(()=>c(getter),e=>e.code==='INVALID_INPUT');
 assert.throws(()=>c({length_m:'1',width_m:'1',excluded_length_m:'0',unit:'mm'}),e=>e.code==='INVALID_INPUT');
});
test('bounded Persian command requires all units and deductions, exact answers for Persian, Arabic and Latin digits',()=>{
 assert.equal(previewSkirting(COMMAND).takeoff.net_skirting_m,'17.1');assert.match(previewSkirting(COMMAND).message,/۱۷٫۱.*۱۸.*۰٫۹/);
 assert.equal(previewSkirting('قرنیز: طول ٥ متر، عرض ٤ متر، کسر ٠٫٩ متر').takeoff.net_skirting_m,'17.1');
 assert.equal(previewSkirting('قرنیز: طول 5 متر، عرض 4 متر، کسر 0 متر').takeoff.net_skirting_m,'18');
 for(const q of ['قرنیز: طول ۵، عرض ۴ متر، کسر ۰٫۹ متر','قرنیز: طول ۵ متر، عرض ۴ متر','قرنیز: طول ۵ متر، عرض ۴ متر، کسر ۰٫۹ سانتی‌متر','قرنیز: طول ۵ متر، عرض ۴ متر، کسر ۰٫۹ مترمربع','قرنیز: طول ۵ متر، عرض ۴ متر، کسر ۰٫۹ متر و فایل بساز','قرنیز: طول ۵ متر، عرض ۴ متر، کسر ۰٫۹۹۹۹ متر']){const r=previewSkirting(q);assert.equal(r.status,'CLARIFY',q);assert.equal(r.takeoff,undefined);}
 assert.match(previewSkirting('قرنیز: طول ۵ متر، عرض ۴ متر، کسر ۱۹ متر').message,/از محیط بیشتر/);
 assert.equal(matchesSkirting('متره کف'),false);assert.equal(matchesSkirting('قرنیز'),true);
});
test('protected /mana performs exact calculation only and preserves separate floor/model/mission behavior',async t=>{
 let runs=0,models=0;
 const server=start({port:0,runner:{history:()=>[],run:async()=>{runs++;return {status:'BENCHMARK_PASSED'};}},manaAnswerText:async()=>{models++;return {status:'TEXT_ANSWER',text:'آزمایشی'};}});
 await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port;
 const page=await(await fetch(origin+'/mana')).text();assert.match(page,/مترهٔ قرنیز/);const token=page.match(/[a-f0-9]{64}/)[0],session=page.replace(token,'').match(/[a-f0-9]{32}/)[0];
 const send=(body,other={})=>fetch(origin+'/mana/turn',{method:'POST',headers:{Origin:origin,'X-Mana-Token':token,'Content-Type':'application/json',...other},body:JSON.stringify({session,...body})});
 const request={action:'message',text:COMMAND};
 assert.equal((await send(request,{Origin:'http://invalid.example'})).status,403);
 assert.equal((await send(request,{'X-Mana-Token':'invalid'})).status,403);
 const p=await(await send({action:'message',text:'برو جلو'})).json();assert.equal(p.status,'CONFIRM_REQUIRED');
 const response=await send(request);assert.equal(response.headers.get('cache-control'),'no-store');const r=await response.json();assert.equal(r.status,'COMPLETED');assert.equal(r.takeoff.net_skirting_m,'17.1');assert.equal(r.confirmation,undefined);assert.equal(r.modelCalls,0);
 assert.equal((await(await send({action:'confirm',confirmation:p.confirmation})).json()).status,'BLOCKED');
 assert.match((await(await send({action:'message',text:'طول ۵ متر، عرض ۴ متر، مساحت کسرشده ۳ مترمربع'})).json()).message,/۱۷ مترمربع/);
 assert.equal(runs,0);assert.equal(models,0);
});
