'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {html}=require('../mobile-ui.cjs');
test('mobile uses local voice routes',()=>{
 assert.match(html,/\/api\/voice\/transcribe/);
 assert.match(html,/\/api\/voice\/speak/);
 assert.match(html,/MediaRecorder/);
 assert.match(html,/audio\/webm/);
 assert.doesNotMatch(html,/webkitSpeechRecognition|speechSynthesis/);
});
