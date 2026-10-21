'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {html}=require('../mobile-ui.cjs');
test('mobile voice uses local API with browser audio capture only',()=>{
 assert.match(html,/id="mic" type="button" disabled/);
 assert.match(html,/MediaRecorder/);
 assert.match(html,/\/api\/voice\/transcribe/);
 assert.match(html,/\/api\/voice\/speak/);
 assert.doesNotMatch(html,/webkitSpeechRecognition|speechSynthesis/);
});
