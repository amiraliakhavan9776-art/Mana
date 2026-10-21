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
