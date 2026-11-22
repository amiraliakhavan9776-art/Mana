'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {proposeOfflineAvailability:propose}=require('../src/jarvis/offline-availability.cjs');
const D='2026-11-22T';
const instant=(h,m,s='00')=>D+h+':'+m+':'+s+'Z';
const interval=(s,e)=>({startUtc:s,endUtc:e});
const at=(h1,m1,h2,m2)=>interval(instant(h1,m1),instant(h2,m2));
const base=()=>({
 calendars:[{busy:[]},{busy:[]}],
 window:at('08','00','12','00'),durationMinutes:30,timeZone:'Asia/Tehran',
});
test('merges overlap from both synthetic calendars and presents exact UTC and Tehran labels',()=>{
 const v=base();
 v.calendars[0].busy=[at('08','00','09','00'),at('10','00','10','50')];
 v.calendars[1].busy=[at('08','45','09','45'),at('11','00','11','30')];
 const frozen=JSON.stringify(v);
 const out=propose(v);
 assert.equal(out.status,'PROPOSED');
 assert.deepEqual(out.proposal,{
  start:{utc:instant('11','30'),local:'2026-11-22T15:00:00',offset:'+03:30'},
  end:{utc:instant('12','00'),local:'2026-11-22T15:30:00',offset:'+03:30'},
 });
 assert.equal(out.actionsExecuted,0);assert.equal(out.approvalGranted,false);
 assert.equal(out.calendarConnected,false);
 assert.equal(JSON.stringify(v),frozen);
});
test('half-open boundaries permit a slot ending on a busy start and starting at a busy end',()=>{
 const v=base();
 v.calendars=[{busy:[at('08','00','09','00')]},{busy:[at('09','30','12','30')]}];
 const out=propose(v);
 assert.equal(out.proposal.start.utc,instant('09','00'));
 assert.equal(out.proposal.end.utc,instant('09','30'));
});
test('tie chooses earliest UTC; order, overlapping duplicates, and outside intervals do not change it',()=>{
 const v=base();
 v.calendars=[
  {busy:[at('11','00','11','30'),at('07','00','08','00'),at('09','00','09','30')]},
  {busy:[at('09','00','09','30'),at('12','00','13','00')]},
 ];
 const out=propose(v);
 assert.equal(out.tieBreak,'EARLIEST_UTC');
 assert.equal(out.proposal.start.utc,instant('08','00'));
 v.calendars=v.calendars.reverse().map(r=>({busy:r.busy.reverse()}));
 assert.deepEqual(propose(v),out);
});
test('conflict or a window shorter than the meeting returns no proposal',()=>{
 const v=base();
 v.calendars=[{busy:[at('06','00','09','44')]},{busy:[at('09','44','15','00')]}];
 const out=propose(v);
 assert.equal(out.status,'NO_COMMON_AVAILABILITY');assert.equal(out.proposal,null);
 assert.equal(out.calendarConnected,false);
 assert.equal(propose({...base(),window:at('08','00','08','29')}).status,'NO_COMMON_AVAILABILITY');
});
test('keeps exact second boundary and distinguishes repeated DST wall times by offset',()=>{
 const v={...base(),timeZone:'America/New_York',durationMinutes:60,
  window:interval('2026-11-01T05:30:07Z','2026-11-01T07:00:00Z')};
 const {proposal}=propose(v);
 assert.equal(proposal.start.local,'2026-11-01T01:30:07');
 assert.equal(proposal.end.local,'2026-11-01T01:30:07');
 assert.equal(proposal.start.offset,'-04:00');
 assert.equal(proposal.end.offset,'-05:00');
 assert.equal(proposal.start.utc,'2026-11-01T05:30:07Z');
 assert.equal(proposal.end.utc,'2026-11-01T06:30:07Z');
});
test('rejects malformed, non-UTC, normalized impossible and over-budget inputs',()=>{
 const cases=[
  [{...base(),calendars:[]},'EXACTLY_TWO_CALENDARS_REQUIRED'],
  [{...base(),calendars:[{busy:[]},{busy:[],owner:'not-permitted'}]},'INVALID_BUSY_CALENDAR'],
  [{...base(),calendars:[{busy:Array(65).fill(at('08','00','09','00'))},{busy:[]}]},'INVALID_BUSY_CALENDAR'],
  [{...base(),durationMinutes:4.5},'INVALID_DURATION_MINUTES'],
  [{...base(),durationMinutes:481},'INVALID_DURATION_MINUTES'],
  [{...base(),timeZone:'+01:00'},'NAMED_TIME_ZONE_REQUIRED'],
  [{...base(),timeZone:'Etc/No_Such_Zone'},'UNKNOWN_TIME_ZONE'],
  [{...base(),send:true},'INVALID_AVAILABILITY_REQUEST'],
  [{...base(),window:interval(instant('08','00').replace('Z','+00:00'),instant('09','00'))},'CANONICAL_UTC_REQUIRED'],
  [{...base(),window:interval('2026-02-30T08:00:00Z','2026-03-30T08:00:00Z')},'INVALID_UTC_INSTANT'],
  [{...base(),window:interval('2026-11-22T08:00:60Z',instant('09','00'))},'INVALID_UTC_INSTANT'],
  [{...base(),window:at('09','00','08','00')},'INTERVAL_END_MUST_FOLLOW_START'],
  [{...base(),window:interval(instant('08','00'),'2026-12-07T08:00:01Z')},'WINDOW_LIMIT_EXCEEDED'],
 ];
 for(const [input,code] of cases)assert.throws(()=>propose(input),{code});
});
test('96 deterministic synthetic schedules agree with an independent minute-grid oracle',()=>{
 const zero=Date.parse(instant('08','00'));
 const fmt=n=>new Date(zero+n*60000).toISOString().replace('.000Z','Z');
 let seed=53097;
 const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let caseNo=0;caseNo<96;caseNo++){
  const window=32,d=1+rand(12),busyArrays=Array.from({length:2},()=>Array.from({length:rand(8)},()=>{
   const s=rand(48)-8;return [s,s+1+rand(10)];
  }));
  const occupancy=Array.from({length:window},(_,i)=>busyArrays.some(a=>a.some(([l,r])=>l<=i&&i<r)));
  const winner=occupancy.findIndex((_,i)=>i+d<=window&&!occupancy.slice(i,i+d).includes(true));
  const result=propose({
   window:interval(fmt(0),fmt(window)),durationMinutes:d,timeZone:'UTC',
   calendars:busyArrays.map(a=>({busy:a.map(([l,r])=>interval(fmt(l),fmt(r)))})),
  });
  if(winner<0)assert.equal(result.proposal,null);
  else{
   assert.equal(result.proposal.start.utc,fmt(winner));
   assert.equal(result.proposal.end.utc,fmt(winner+d));
   assert.equal(result.proposal.start.offset,'+00:00');
  }
 }
});
