'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {passwordRecord,createSessionAuth}=require('../src/session-auth.cjs');
test('passwords are hashed and valid sessions are scoped',()=>{
 const record=passwordRecord('a-long-passphrase-123');
 assert.equal(record.digest.includes('passphrase'),false);
 let time=1000;
 const auth=createSessionAuth({accounts:[{userId:'alice',organizationId:'org1',...record}],now:()=>time,ttlMs:60000});
 assert.equal(auth.login('alice','wrong-password'),null);
 const login=auth.login('alice','a-long-passphrase-123');
 assert.equal(login.token.length,64);
 const principal=auth.authenticate({headers:{authorization:'Bearer '+login.token}});
 assert.equal(principal.organizationId,'org1');
 assert.equal(principal.verifyCsrf(login.csrf),true);
 assert.equal(principal.verifyCsrf('bad'),false);
 time=61000;assert.equal(auth.authenticate({headers:{authorization:'Bearer '+login.token}}),null);
});
test('revoked sessions and invalid accounts are rejected',()=>{
 const auth=createSessionAuth({accounts:[{userId:'a',organizationId:'org',...passwordRecord('long-enough-secret')}]});
 const session=auth.login('a','long-enough-secret');
 auth.revoke(session.token);
 assert.equal(auth.authenticate({headers:{authorization:'Bearer '+session.token}}),null);
 assert.throws(()=>passwordRecord('short'));
});
test('session limits do not evict valid sessions and reclaim expired capacity',()=>{
 let time=1000;
 const account={userId:'alice',organizationId:'org',...passwordRecord('long-passphrase-123')};
 const auth=createSessionAuth({accounts:[account],maxSessions:1,ttlMs:60000,now:()=>time});
 const first=auth.login('alice','long-passphrase-123');
 assert.equal(auth.login('alice','long-passphrase-123'),null);
 assert.equal(auth.authenticate({headers:{authorization:'Bearer '+first.token}}).userId,'alice');
 time=61000;
 const next=auth.login('alice','long-passphrase-123');assert.ok(next);
 assert.equal(auth.authenticate({headers:{authorization:'Bearer '+first.token}}),null);
 assert.equal(next.expiresAt,121000);
});
test('account identity is immutable and missing identifiers are rejected',()=>{
 const account={userId:'alice',organizationId:'org',...passwordRecord('long-passphrase-123')};
 const auth=createSessionAuth({accounts:[account]});account.organizationId='other';
 const session=auth.login('alice','long-passphrase-123');
 assert.equal(auth.authenticate({headers:{authorization:'Bearer '+session.token}}).organizationId,'org');
 for(const value of [null,{...account,userId:undefined},{...account,organizationId:undefined}])assert.throws(()=>createSessionAuth({accounts:[value]}),/Invalid account/);
 assert.throws(()=>createSessionAuth({maxSessions:0}));
 assert.equal(auth.authenticate({}),null);
});
test('invalid clocks fail closed and issue one consistent expiration',()=>{
 const account={userId:'alice',organizationId:'org',...passwordRecord('long-passphrase-123')};
 let calls=0;
 const auth=createSessionAuth({accounts:[account],ttlMs:60000,now:()=>1000+calls++});
 assert.equal(auth.login('alice','long-passphrase-123').expiresAt,61000);
 assert.equal(calls,1);
 for(const value of [NaN,-1,Number.MAX_SAFE_INTEGER]){
  const invalid=createSessionAuth({accounts:[account],now:()=>value});
  assert.throws(()=>invalid.login('alice','long-passphrase-123'),/clock/);
 }
});
