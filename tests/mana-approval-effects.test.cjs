'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function application(){
 const DB={settings:{},projects:[{id:'p',activities:[{id:'a',dur:10,progress:0},{id:'manual',dur:10,progress:25}]}],invoices:[{id:'i',projectId:'p',status:'pending',items:[{activityId:'a',materialId:'m',qty:5,price:100,coef:1}]}],activityMaterials:[{id:'m',projectId:'p',activityId:'a',name:'concrete',planned:10,consumed:0}]};
 const ACT={},timers=[],window={};
 const ctx=vm.createContext({DB,ACT,window,document:{querySelector:()=>null},NAV:[],ROUTES:{invoices:{render:()=>''},gantt:{render:()=>''}},defRoute:()=>{},invForm:()=>'',setTimeout:fn=>timers.push(fn),setInterval:()=>{},save:()=>{},render:()=>{},buildNav:()=>{},toast:()=>{},pushUndo:()=>{},todayISO:()=> '2026-10-26',prompt:()=> 'synthetic reviewer',confirm:()=>true});
 for(const name of ['toEn','num'])new vm.Script(source.split('\n').find(l=>l.startsWith('function '+name+'('))).runInContext(ctx);
 const start=source.indexOf('window.ManaActMat = {'),end=source.indexOf('\n};',start);
 assert.ok(start>0&&end>start);new vm.Script(source.slice(start,end+3)).runInContext(ctx);
 const scripts=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
 new vm.Script(scripts.at(-1)[1]).runInContext(ctx);
 return {DB,ACT,window,timers};
}
test('revoking the only approved invoice removes materials, cost and automatic progress while preserving manual progress',()=>{
 const {DB,ACT,window}=application();ACT['inv-approve']({dataset:{id:'i'}});
 assert.equal(DB.activityMaterials[0].consumed,5);assert.equal(window.ManaActMat.costFor('p','a'),500);assert.equal(DB.projects[0].activities[0].progress,50);assert.equal(DB.projects[0].progress,37.5);
 ACT['inv-unapprove']({dataset:{id:'i'}});
 assert.equal(DB.activityMaterials[0].consumed,0);assert.equal(window.ManaActMat.costFor('p','a'),0);assert.equal(DB.projects[0].activities[0].progress,0);assert.equal(DB.projects[0].activities[1].progress,25);assert.equal(DB.projects[0].progress,12.5);
});
test('rejection and partial reversal recompute from remaining approved records rather than incrementing',()=>{
 const {DB,ACT}=application();DB.invoices.push({id:'j',projectId:'p',status:'approved',items:[{activityId:'a',materialId:'m',qty:2,price:100}]});
 ACT['inv-approve']({dataset:{id:'i'}});assert.equal(DB.projects[0].activities[0].progress,70);
 ACT['inv-reject']({dataset:{id:'i'}});assert.equal(DB.activityMaterials[0].consumed,2);assert.equal(DB.projects[0].activities[0].progress,20);
 ACT['inv-reject']({dataset:{id:'j'}});assert.equal(DB.activityMaterials[0].consumed,0);assert.equal(DB.projects[0].activities[0].progress,0);
});
