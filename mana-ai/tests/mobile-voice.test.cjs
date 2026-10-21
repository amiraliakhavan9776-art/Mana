'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {html}=require('../mobile-ui.cjs');
test('voice controls are opt-in and initially disabled',()=>{
 assert.match(html,/id="mic" type="button" disabled/);
 assert.match(html,/id="speak" type="button" disabled/);
 assert.match(html,/window.confirm/);
 assert.match(html,/fa-IR/);
 assert.match(html,/speechSynthesis/);
 assert.match(html,/سرویس خارجی/);
});
