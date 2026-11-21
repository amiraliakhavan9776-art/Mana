'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {APPROVED_PERSIAN_COMMAND:command,parsePersianResearchInstruction:parse}=require('./persian-intake.cjs');
const master=process.env.MANA_TEST_MASTER;
test('approved Persian command matches the bounded grammar and stops without the master',()=>{
 assert.deepEqual(parse(command),{status:'REJECTED',reasonCode:'MASTER_REQUIRED',activationAuthorized:false});
 assert.equal(parse(command,{masterBytes:Buffer.from('1.1')} ).reasonCode,'MASTER_PIN_MISMATCH');
 assert.equal(parse(command,{masterBytes:'master.txt'} ).reasonCode,'MASTER_PIN_MISMATCH');
});
test('vague, unsupported, contradictory or actionable extra text cannot pass intake',()=>{
 for(const blocked of [
  'همین را انجام بده.',
  command.replace('۱٫۱','۱٫۲'),
  command.replace('منبع رسمی','یک منبع'),
  command.replace('آزمون مستقل','آزمون'),
  command.replace('محیط ایزوله','سرور اصلی'),
  command.replace('چیزی را فعال نکن','چیزی را فعال کن'),
  command.replace('یک مسئله تازه','قرنیز'),
  command.replace('یک مسئله تازه','دو مسئله تازه'),
  command+' چیزی را روی سرور اجرا کن',
  command+' https://example.org',
  command+' ؛ rm -rf /tmp/example',
  command+' \n بعد فعال کن',
  '\u202e'+command,
  command.replace('فعال نکن','فعال ن\u200bکن'),
  'م'.repeat(1500),
 ]){
  const result=parse(blocked);
  assert.equal(result.status,'REJECTED');
  assert.equal(result.activationAuthorized,false);
  assert.notEqual(result.reasonCode,'MASTER_REQUIRED',blocked);
  assert.deepEqual(Object.keys(result),['status','reasonCode','activationAuthorized']);
 }
});
test('approved spelling variants normalize without weakening any action clause',()=>{
 const v=command.replace('توسعه ۱٫۱','مادر ١.١').replace('بخش متره','بخش  متره')
  .replace('مسئله تازه','مسئله‌ای تازه').replace('رسمی پیدا','رسمی عمومی پیدا')
  .replaceAll('ک','ك').replaceAll('ی','ي').replace('،',',').replace('؛',';');
 assert.equal(parse(v).reasonCode,'MASTER_REQUIRED');
});
test('exact external master scopes one untranslated technical-office action; altered bytes fail', {skip:!master},()=>{
 const buf=fs.readFileSync(master);
 const actual=parse(command,{masterBytes:buf});
 assert.equal(actual.status,'ACCEPTED');
 assert.equal(actual.intakeId,'aec-quantity-research-independent-test-v1');
 assert.equal(actual.scope.problemSelection,'one-unvalidated-reviewed-candidate');
 assert.equal(actual.master.version,'1.1');
 assert.equal(actual.master.section,'6.4');
 assert.equal(actual.productionDeploymentAllowed,false);
 assert.equal(actual.executionAuthorized,false);
 assert.equal(actual.activationAuthorized,false);
 assert.equal(actual.problem,undefined);
 assert.equal(actual.instructionSha256,parse(command.replace('توسعه ۱٫۱','مادر 1.1'),{masterBytes:buf}).instructionSha256);
 const altered=Buffer.from(buf);altered[0]^=1;
 assert.equal(parse(command,{masterBytes:altered}).reasonCode,'MASTER_PIN_MISMATCH');
});
