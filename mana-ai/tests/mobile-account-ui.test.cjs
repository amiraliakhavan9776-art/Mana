'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {html}=require('../mobile-ui.cjs');
test('mobile UI includes account controls and authenticated history retrieval',()=>{
 for(const fragment of ['id="login"','id="logout"','id="loadHistory"','/api/auth/login','/api/auth/logout','/api/conversations/','Authorization:',"session=null"])assert.ok(html.includes(fragment),fragment);
 assert.equal(html.includes('localStorage.setItem'),false);
 assert.equal(html.includes('sessionStorage.setItem'),false);
});
