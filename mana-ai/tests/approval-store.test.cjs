'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createApprovalStore,payloadDigest}=require('../src/approval-store.cjs');
const requester={id:'requester',orgId:'org'},approver={id:'approver',orgId:'org'},executor={id:'executor',orgId:'org'};
const input={action:'payments:execute',projectId:'p',resourceId:'invoice1',dataVersion:'v1',toolVersion:'t1',payload:{amount:100,destination:'account1'}};
function fixture(run){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mana-approval-')),file=path.join(dir,'approvals.enc'),key=Buffer.alloc(32,8);
 let time=10000,revoked=false;
 const authorize=(p,op,r)=>p.orgId==='org'&&r.projectId==='p'&&((op==='request'&&p.id==='requester')||(op==='approve'&&p.id==='approver')||(op==='execute'&&p.id==='executor')||(op==='revalidate-approver'&&p.id==='approver'&&!revoked));
 const open=()=>createApprovalStore({file,key,authorize,now:()=>time});
 try{run({open,file,key,setTime:v=>{time=v},revoke:()=>{revoked=true}})}finally{fs.rmSync(dir,{recursive:true,force:true})}
}
function approved(store){const pending=store.request({principal:requester,...input});return store.decide({principal:approver,approvalId:pending.id,approve:true,reason:'Reviewed synthetic payment'});}
const claim=(store,id,changes={})=>store.claim({principal:executor,approvalId:id,...input,idempotencyKey:'once',...changes});
test('approval persists across restart and can be claimed only once, without executing an effect',()=>fixture(({open,file})=>{
 const approval=approved(open());
 assert.equal(fs.readFileSync(file).includes(Buffer.from('requester')),false);
 assert.equal(claim(open(),approval.id).status,'executing');
 assert.throws(()=>claim(open(),approval.id),/unavailable/);
 assert.equal(open().finish({principal:executor,approvalId:approval.id,outcome:'unknown'}).status,'unknown');
 assert.throws(()=>claim(open(),approval.id),/unavailable/);
}));
test('changed payload, resource, data/tool versions or tenant cannot use approval',()=>fixture(({open})=>{
 const store=open(),approval=approved(store);
 for(const changes of [{payload:{amount:101,destination:'account1'}},{payload:{amount:100,destination:'account2'}},{dataVersion:'v2'},{toolVersion:'t2'},{resourceId:'other'},{projectId:'other'},{action:'contracts:sign'}])assert.throws(()=>claim(store,approval.id,changes),/binding changed/);
 assert.throws(()=>claim(store,approval.id,{principal:{...executor,orgId:'other'}}),/permission/);
 assert.equal(claim(store,approval.id).status,'executing');
}));
test('revoked approver is rechecked at claim time',()=>fixture(({open,revoke})=>{
 const store=open(),approval=approved(store);revoke();
 assert.throws(()=>claim(store,approval.id),/revoked/);
}));
test('expiry, rejection, duplicate execution keys and self approval fail closed',()=>fixture(({open,setTime})=>{
 const store=open(),first=approved(store);
 claim(store,first.id);
 const second=approved(store);assert.throws(()=>claim(store,second.id),/already used/);
 setTime(400000);assert.throws(()=>claim(store,second.id,{idempotencyKey:'different'}),/expired/);
}));
test('self approval and rejected decisions cannot be consumed',()=>fixture(({open,file,key})=>{
 const store=createApprovalStore({file,key,authorize:()=>true,now:()=>10000});
 const pending=store.request({principal:requester,...input});
 assert.throws(()=>store.decide({principal:requester,approvalId:pending.id,approve:true,reason:'self'}),/Self approval/);
 store.decide({principal:approver,approvalId:pending.id,approve:false,reason:'Rejected synthetic payment'});
 assert.throws(()=>claim(open(),pending.id),/unavailable/);
}));
test('invalid keys/ciphertext and a concurrent writer lock fail without resetting approvals',()=>fixture(({open,file,key})=>{
 const approval=approved(open());fs.writeFileSync(file+'.lock','');
 assert.throws(()=>claim(open(),approval.id),/EEXIST/);fs.unlinkSync(file+'.lock');
 const bytes=fs.readFileSync(file);bytes[30]^=1;fs.writeFileSync(file,bytes);
 assert.throws(()=>claim(open(),approval.id));assert.equal(fs.existsSync(file+'.lock'),false);
}));
test('canonical digest is stable but rejects disappearing values and cycles',()=>{
 assert.equal(payloadDigest({a:1,b:2}),payloadDigest({b:2,a:1}));
 for(const value of [undefined,NaN,{x:undefined},new Array(1)])assert.throws(()=>payloadDigest(value));
 const cycle={};cycle.self=cycle;assert.throws(()=>payloadDigest(cycle),/complex/);
});
test('cancelled approvals and completed claims cannot be replayed after restart',()=>fixture(({file,key})=>{
 const open=()=>createApprovalStore({file,key,authorize:()=>true,now:()=>10000});
 const first=approved(open());
 open().cancel({principal:requester,approvalId:first.id,reason:'Changed plan'});
 assert.throws(()=>claim(open(),first.id),/unavailable/);
 const second=approved(open());claim(open(),second.id);
 assert.equal(open().finish({principal:executor,approvalId:second.id,outcome:'succeeded'}).status,'succeeded');
 assert.throws(()=>claim(open(),second.id),/unavailable/);
 assert.throws(()=>open().cancel({principal:requester,approvalId:second.id,reason:'Too late'}),/cannot be cancelled/);
}));
