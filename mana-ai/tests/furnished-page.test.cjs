'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {furnishedPage}=require('../src/furnished/page.cjs');
const brief={width:12,length:20,wallHeight:2.8,preference:'social'};
function response(){return {brief,constructionApproved:false,plans:['spine','gallery'].map((id,i)=>({id,entrySide:i?'west':'south',rooms:[{id:'living',x:0,y:0,w:12,h:20}],furniture:[{id:'sofa',kind:'sofa',roomId:'living',x:i+1,y:2,w:2,h:1}],walls:[[[0,0],[12,0]]],openings:[{kind:'door',a:[0,0],b:[1,0]}],validation:{constructionApproved:false,concerns:[{kind:'straight_route_concern',roomId:'living',furnitureId:'sofa'}]}})),downloads:[{name:'booklet.pdf',url:'/furnished/download/abc/booklet.pdf'}]};}
function harness(fetcher){const nodes=new Map(),requests=[];
 const node=tag=>({tag,textContent:'',value:'',children:[],attrs:{},listeners:{},classList:{add(){},remove(){}},setAttribute(k,v){this.attrs[k]=v;},append(...x){this.children.push(...x);},replaceChildren(){this.children=[];},addEventListener(k,v){this.listeners[k]=v;},reset(){}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);};
 const context={document:{getElementById:get,createElement:node,createElementNS:(_ns,tag)=>node(tag)},AbortController,fetch:async(url,o)=>{requests.push({url,...o});return fetcher?fetcher(url,o):{ok:true,json:async()=>response()};}};
 vm.runInNewContext(furnishedPage('a'.repeat(64)).match(/<script>([\s\S]*)<\/script>/)[1],context);
 for(const [k,v]of Object.entries({width:'12',length:'20',height:'2.8',preference:'social'}))get(k).value=v;
 return {get,requests,submit:()=>get('brief').onsubmit({preventDefault(){}})};
}
const descendants=n=>[n,...n.children.flatMap(descendants)];
test('page validates trusted config, labels bounded wishes and makes no startup network call',()=>{
 assert.throws(()=>furnishedPage("</script>"));assert.throws(()=>furnishedPage('a'.repeat(64),{basePath:'//evil'}));
 const html=furnishedPage('a'.repeat(64));assert.match(html,/dir="rtl"/);assert.match(html,/نورگیری/);assert.match(html,/دفترچهٔ کامل معماری/);assert.equal(harness().requests.length,0);
});
test('actual inline client posts explicit brief, draws two furniture plans and same-origin booklet links',async()=>{
 const ui=harness();await ui.submit();assert.equal(ui.requests[0].url,'/furnished/generate');assert.deepEqual(JSON.parse(ui.requests[0].body),{...brief,precedents:false});
 const cards=ui.get('results').children;assert.equal(cards.length,2);
 for(const card of cards){const svg=card.children.find(x=>x.tag==='svg');assert.ok(svg);assert.equal(svg.attrs.viewBox,'-1 -1 14 22.5');const furniture=svg.children.find(x=>x.tag==='rect'&&x.attrs.fill==='#b48858');assert.equal(furniture.attrs.y,'17');assert.equal(furniture.attrs.width,'2');}
 assert.equal(ui.get('files').children.length,1);assert.equal(ui.get('files').children[0].href,'/furnished/download/abc/booklet.pdf');cards[1].children.at(-1).onclick();assert.match(ui.get('selection').textContent,/گذر عرضی/);
 ui.get('width').listeners.input();assert.equal(ui.get('results').children.length,0);assert.equal(ui.get('files').children.length,0);assert.equal(ui.get('selection').textContent,'');
});
test('rendered strings are text; external or traversal downloads never become links',async()=>{
 const data=response();data.plans[0].rooms[0].name='<script>bad()</script>';data.downloads.push({name:'bad',url:'https://evil.invalid/x'},{name:'bad',url:'/furnished/download/../secret'});
 const ui=harness(async()=>({ok:true,json:async()=>data}));await ui.submit();const all=descendants(ui.get('results'));assert.ok(all.some(n=>n.tag==='text'&&n.textContent==='<script>bad()</script>'));assert.ok(!all.some(n=>n.tag==='script'));assert.equal(ui.get('files').children.length,1);
});
test('out-of-order response after edit or reset cannot restore old drawings',async()=>{
 let release;const wait=new Promise(r=>release=r);const ui=harness(async()=>{await wait;return {ok:true,json:async()=>response()};});const pending=ui.submit();assert.equal(ui.get('generate').disabled,true);ui.get('clear').onclick();release();await pending;assert.equal(ui.get('results').children.length,0);assert.equal(ui.get('generate').disabled,false);
});
test('invalid geometry and construction-approved claims fail closed',async()=>{
 for(const mutate of [x=>x.plans[0].furniture[0].w=99,x=>x.plans[0].walls=[[[NaN,0],[0,1]]],x=>x.plans[0].validation.constructionApproved=true,x=>x.plans=[]]){const data=response();mutate(data);const ui=harness(async()=>({ok:true,json:async()=>data}));await ui.submit();assert.equal(ui.get('results').children.length,0);assert.equal(ui.get('files').children.length,0);assert.ok(ui.get('status').textContent);}
});
test('opt-in curated sources show human-readable strategy without claiming automatic derivation',async()=>{
 const data=response();data.precedents={noticeFa:'منابع گزینش‌شده محلی',matches:[{name:'مرجع نمونه',sourceUrl:'https://example.com/reference',observationFa:'مشاهده نمونه',strategyFa:'راهبرد قابل بررسی',tradeoffFa:'نیاز به تطبیق سایت',sourceType:'curated',retrievalDate:'2026-11-19'}]};
 const ui=harness(async()=>({ok:true,json:async()=>data}));ui.get('precedents').checked=true;await ui.submit();assert.equal(JSON.parse(ui.requests[0].body).precedents,true);assert.match(ui.get('sources').textContent,/راهبرد قابل بررسی/);assert.match(ui.get('sources').textContent,/استخراج نشده/);
});
