'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createMobileSessions}=require('../src/mobile-session.cjs');
test('isolates conversations between users and organizations',()=>{
 const sessions=createMobileSessions();
 const a=sessions.create({userId:'a',organizationId:'company-1'});
 const b=sessions.create({userId:'b',organizationId:'company-2'});
 assert.notEqual(a,b);
 sessions.append(a,{role:'user',text:'Confidential'});
 assert.deepEqual(sessions.history(b),[]);
 assert.deepEqual(sessions.history(a),[{role:'user',text:'Confidential'}]);
 assert.equal(sessions.identity(a).organizationId,'company-1');
});
test('expiry and revocation block access',()=>{
 let now=1000;const sessions=createMobileSessions({ttlMs:1000,clock:()=>now});
 const token=sessions.create({userId:'a',organizationId:'company'});
 now=2000;assert.equal(sessions.identity(token),null);
 assert.throws(()=>sessions.history(token),/Unauthorized/);
 const next=sessions.create({userId:'a',organizationId:'company'});
 sessions.revoke(next);assert.equal(sessions.identity(next),null);
});
test('bounded history and invalid input',()=>{
 const sessions=createMobileSessions();const token=sessions.create({userId:'a',organizationId:'company'});
 for(let i=0;i<50;i++)sessions.append(token,{role:'user',text:String(i)});
 assert.equal(sessions.history(token).length,40);
 assert.equal(sessions.history(token)[0].text,'10');
 assert.throws(()=>sessions.append(token,{role:'system',text:'x'}),/Invalid message/);
 assert.equal(sessions.identity('invalid'),null);
});
