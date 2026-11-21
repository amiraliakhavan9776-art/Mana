'use strict';

const {createHash}=require('node:crypto');
const APPROVED_PERSIAN_COMMAND='طبق سند توسعه ۱٫۱ از بخش متره و برآورد یک مسئله تازه انتخاب کن، منبع رسمی پیدا کن و پیشنهاد را با آزمون مستقل در محیط ایزوله بسنج؛ چیزی را فعال نکن.';
const MASTER=Object.freeze({
 version:'1.1',section:'6.4',
 documentSha256:'b9ce58b50834cbbeba50997998a937392bceba613905f611a99bf6df42277ce2',
 sectionSha256:'e7454332dc9eeb3a1cd616da551b77e40814be82c4c39578e0010952fc3d7fbd',
 byteStart:31943,byteEndExclusive:34098,
});
const INTAKE_ID='aec-quantity-research-independent-test-v1';
const MAX_TEXT=768;
const MASTER_SIZE=76759;
const hash=x=>createHash('sha256').update(x).digest('hex');
const reject=reasonCode=>({status:'REJECTED',reasonCode,activationAuthorized:false});

// A small explicit command grammar, not an open-ended Persian intent model.
const GRAMMAR=/^طبق سند(?: توسعه| مادر)? 1\.1 از بخش متره و برآورد یک مسئله(?: ای|ای)? تازه انتخاب کن منبع رسمی(?: عمومی)? پیدا کن و پیشنهاد را با آزمون مستقل در محیط ایزوله بسنج چیزی را فعال نکن$/u;
function normalizeCommand(s){
 if(typeof s!=='string'||s.length===0||s.length>MAX_TEXT||Buffer.byteLength(s)>MAX_TEXT)return null;
 // Do not join lines or silently remove bidi/zero-width controls used to join commands.
 if(/[^\p{Script=Arabic}\p{Mark}0-9 .،؛٫,;\t\u00a0\u200c]/u.test(s))return null;
 return s.normalize('NFC')
  .replace(/[۰-۹]/gu,c=>String(c.codePointAt(0)-0x06f0))
  .replace(/[٠-٩]/gu,c=>String(c.codePointAt(0)-0x0660))
  .replace(/ي/gu,'ی').replace(/ك/gu,'ک')
  .replace(/ۀ/gu,'ه').replace(/\u0654/gu,'') // optional written ezafe
  .replace(/\u200c/gu,' ')
  .replace(/٫/gu,'.')
  .replace(/[،؛,;]/gu,' ')
  .replace(/[.][ \t\u00a0]*$/u,'')
  .replace(/[ \t\u00a0]+/gu,' ').trim()
  .replace(/^طبق سند(?: توسعه| مادر)? /u,'طبق سند توسعه ')
  .replace(/ مسئله(?: ای|ای) تازه /u,' مسئله تازه ')
  .replace(/ منبع رسمی عمومی /u,' منبع رسمی ');
}

/**
 * Match only the reviewed request and attach a pin to authorized in-memory
 * bytes supplied by the host. No file I/O, discovery, selection, or execution.
 */
function parsePersianResearchInstruction(text,{masterBytes}={}){
 const normalized=normalizeCommand(text);
 if(normalized===null)return reject('INVALID_INSTRUCTION_TEXT');
 if(!GRAMMAR.test(normalized))return reject('UNSUPPORTED_INSTRUCTION');
 if(masterBytes===undefined||masterBytes===null)return reject('MASTER_REQUIRED');
 if(!Buffer.isBuffer(masterBytes)||masterBytes.length!==MASTER_SIZE||
    hash(masterBytes)!==MASTER.documentSha256||
    hash(masterBytes.subarray(MASTER.byteStart,MASTER.byteEndExclusive))!==MASTER.sectionSha256)
  return reject('MASTER_PIN_MISMATCH');
 return {
  status:'ACCEPTED',intakeId:INTAKE_ID,instructionSha256:hash(normalized),
  scope:{
   domain:'technical-office',category:'quantity-takeoff',
   problemSelection:'one-unvalidated-reviewed-candidate',
   sources:'official-public-reviewed-origins-only',trial:'independent-isolated-cpu-numerics',
  },
  master:{...MASTER},
  executionAuthorized:false,activationAuthorized:false,productionDeploymentAllowed:false,
 };
}
module.exports={APPROVED_PERSIAN_COMMAND,parsePersianResearchInstruction};
