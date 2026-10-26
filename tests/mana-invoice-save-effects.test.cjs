'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const acorn=require('../tools/parser/node_modules/acorn');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function application(){
 const DB={settings:{},projects:[{id:'p',activities:[]}],invoices:[],activityMaterials:[{id:'m',projectId:'p',activityId:'a',name:'concrete',planned:10,consumed:0}]},ACT={},window={},timers=[];
 const input={items:[{desc:'concrete',qty:5,price:100,activityId:'a',materialId:'m'}],form:{projectId:'p',no:'test'}};let sequence=0,saves=0;
 const overlay={querySelector:()=>({value:input.form.projectId})};
 const ctx=vm.createContext({DB,ACT,window,document:{querySelector:()=>null,getElementById:()=>overlay},NAV:[],ROUTES:{invoices:{render:()=>''},gantt:{render:()=>''}},defRoute:()=>{},invForm:()=>'',readForm:()=>input.form,collectItems:()=>input.items,$:()=>overlay,uid:()=> 'new-'+(++sequence),setTimeout:(fn,ms)=>timers.push({fn,ms}),setInterval:()=>{},save:()=>{saves++},render:()=>{},closeModal:()=>{},buildNav:()=>{},toast:()=>{},pushUndo:()=>{},todayISO:()=> '2026-10-26',prompt:()=> 'reviewer',confirm:()=>true});
 for(const name of ['toEn','num','act'])new vm.Script(source.split('\n').find(l=>l.startsWith('function '+name+'('))).runInContext(ctx);
 const scripts=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
 new vm.Script(scripts.find(s=>s[1].includes('PATCH-MOBILE-FORM'))[1]).runInContext(ctx);
 function assignment(marker){const offset=source.indexOf("ACT['inv-save'] =",source.indexOf(marker));assert.ok(offset>0);const node=acorn.parseExpressionAt(source,offset,{ecmaVersion:2022});new vm.Script(source.slice(node.start,node.end)).runInContext(ctx);}
 assignment('/* ذخیره با فیلدهای جدید */');
 new vm.Script(scripts.find(s=>s[1].includes('MANA INVOICE ↔ ACTIVITY ↔ GANTT LINK'))[1]).runInContext(ctx);
 new vm.Script(scripts.at(-1)[1]).runInContext(ctx);ctx.collectItems=()=>input.items;
 const flush=()=>{while(timers.length)timers.shift().fn()};flush();
 return {DB,ACT,input,flush,saves:()=>saves};
}
test('a saved draft has immediate identity/status and never consumes materials after delayed handlers',()=>{
 const {DB,ACT,flush}=application();const saved=ACT['inv-save']({dataset:{}});
 assert.equal(DB.invoices.length,1);assert.equal(DB.invoices[0].status,'draft');assert.equal(saved,DB.invoices[0]);flush();assert.equal(DB.activityMaterials[0].consumed,0);
});
test('failed save cannot modify an unrelated last invoice or schedule its draft transition',()=>{
 const {DB,ACT,input,flush,saves}=application();DB.invoices.push({id:'unrelated',projectId:'p',items:[]});input.items=[];
 const before=JSON.stringify(DB),count=saves();assert.equal(ACT['inv-save']({dataset:{}}),undefined);flush();assert.equal(JSON.stringify(DB),before);assert.equal(saves(),count);
});
test('repeated edits of a pending invoice preserve identity/payments and never increment consumed quantities',()=>{
 const {DB,ACT,flush}=application();DB.invoices.push({id:'existing',projectId:'p',status:'pending',items:[],payments:[{amount:20}]});
 ACT['inv-save']({dataset:{id:'existing'}});flush();ACT['inv-save']({dataset:{id:'existing'}});flush();
 assert.equal(DB.invoices.length,1);assert.equal(DB.invoices[0].payments[0].amount,20);assert.equal(DB.activityMaterials[0].consumed,0);
});
test('unknown project and missing edit target cannot write or affect unrelated records',()=>{
 for(const mode of ['project','invoice']){
  const {DB,ACT,input,flush,saves}=application();if(mode==='project')input.form.projectId='missing';
  const before=JSON.stringify(DB),count=saves();assert.equal(ACT['inv-save']({dataset:mode==='invoice'?{id:'missing'}:{}}),undefined);flush();assert.equal(JSON.stringify(DB),before);assert.equal(saves(),count);
 }
});
