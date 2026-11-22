'use strict';
// Pure review-only interval arithmetic. No files, clocks, connectors or side effects.
const SCHEMA='MANA_JARVIS_OFFLINE_AVAILABILITY_V1';
const UTC=/^(?:19[7-9][0-9]|20[0-9]{2})-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
const ZONE=/^(?:UTC|[A-Za-z_][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){1,3})$/;
const MINUTE=60000,MAX_WINDOW=14*24*60*MINUTE,MAX_BUSY=64,MAX_DURATION=480;
function requireTrue(value,code) {
 if(!value){const e=new TypeError(code);e.code=code;throw e;}
}
function shape(value,keys) {
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value))||
    Reflect.ownKeys(value).length!==keys.length)return false;
 return keys.every(key=>{
  const d=Object.getOwnPropertyDescriptor(value,key);
  return d?.enumerable===true&&Object.hasOwn(d,'value');
 });
}
function utc(ms) {return new Date(ms).toISOString().replace('.000Z','Z');}
function parseUtc(value) {
 requireTrue(typeof value==='string'&&UTC.test(value),'CANONICAL_UTC_REQUIRED');
 const ms=Date.parse(value);
 requireTrue(Number.isSafeInteger(ms)&&utc(ms)===value,'INVALID_UTC_INSTANT');
 return ms;
}
function interval(value) {
 requireTrue(shape(value,['startUtc','endUtc']),'INVALID_AVAILABILITY_INTERVAL');
 const start=parseUtc(value.startUtc),end=parseUtc(value.endUtc);
 requireTrue(start<end,'INTERVAL_END_MUST_FOLLOW_START');
 return [start,end];
}
function makeLabels(timeZone) {
 requireTrue(typeof timeZone==='string'&&timeZone.length<=80&&ZONE.test(timeZone),'NAMED_TIME_ZONE_REQUIRED');
 let f;
 try {
  f=new Intl.DateTimeFormat('en-GB',{timeZone,timeZoneName:'longOffset',year:'numeric',month:'2-digit',day:'2-digit',
   hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',calendar:'gregory',numberingSystem:'latn'});
 }catch{requireTrue(false,'UNKNOWN_TIME_ZONE');}
 const label=ms=>{
  const p=Object.fromEntries(f.formatToParts(ms).map(x=>[x.type,x.value]));
  const offset=p.timeZoneName==='GMT'?'+00:00':p.timeZoneName?.replace(/^GMT/,'').replace('−','-');
  requireTrue(typeof offset==='string'&&/^[+-]\d\d:\d\d(?::\d\d)?$/.test(offset),'TIME_ZONE_FORMAT_UNAVAILABLE');
  return {utc:utc(ms),local:p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second,offset};
 };
 return {canonicalZone:f.resolvedOptions().timeZone,label};
}
function proposeOfflineAvailability(input) {
 requireTrue(shape(input,['calendars','window','durationMinutes','timeZone']),'INVALID_AVAILABILITY_REQUEST');
 const {calendars,durationMinutes,timeZone}=input;
 requireTrue(Array.isArray(calendars)&&calendars.length===2,'EXACTLY_TWO_CALENDARS_REQUIRED');
 const [from,to]=interval(input.window);
 requireTrue(to-from<=MAX_WINDOW,'WINDOW_LIMIT_EXCEEDED');
 requireTrue(Number.isSafeInteger(durationMinutes)&&durationMinutes>=1&&durationMinutes<=MAX_DURATION,'INVALID_DURATION_MINUTES');
 const span=durationMinutes*MINUTE;
 const {canonicalZone,label}=makeLabels(timeZone);
 const busy=[];
 for(const calendar of calendars){
  requireTrue(shape(calendar,['busy'])&&Array.isArray(calendar.busy)&&calendar.busy.length<=MAX_BUSY,'INVALID_BUSY_CALENDAR');
  for(const row of calendar.busy){
   const [start,end]=interval(row);
   const clipped=[Math.max(start,from),Math.min(end,to)];
   if(clipped[0]<clipped[1])busy.push(clipped);
  }
 }
 busy.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 let candidate=from;
 for(const [start,end] of busy){
  if(candidate+span<=start)break;
  if(end>candidate)candidate=end;
 }
 const fit=candidate+span<=to;
 return {schema:SCHEMA,status:fit?'PROPOSED':'NO_COMMON_AVAILABILITY',timeZone:canonicalZone,
  requestedTimeZone:timeZone,durationMinutes,tieBreak:'EARLIEST_UTC',
  proposal:fit?{start:label(candidate),end:label(candidate+span)}:null,
  approvalGranted:false,actionsExecuted:0,calendarConnected:false};
}
module.exports={proposeOfflineAvailability};
