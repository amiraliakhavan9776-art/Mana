'use strict';
const {createHash}=require('node:crypto');
const {calculateFloorTakeoff}=require('../native/floor-takeoff.cjs');
const fail=()=>{throw Error('Unsupported exact room geometry: require metres with at most six decimal places');};
function dimension(v){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100)fail();const s=String(v);if(!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(s))fail();return s;}
function fixed(s){const[a,b='']=s.split('.');return BigInt(a)*1000000000000n+BigInt(b.padEnd(12,'0'));}
function format(n){const a=n/1000000000000n,b=(n%1000000000000n).toString().padStart(12,'0').replace(/0+$/,'');return a.toString()+(b?'.'+b:'');}
function takeoffPlans(plans){
 if(!Array.isArray(plans)||plans.length!==2||plans[0].id!=='spine'||plans[1].id!=='gallery')throw Error('Two ordered generated plans required');
 const geometry=plans.map(p=>{if(p.unit!=='m'||!Array.isArray(p.rooms)||p.rooms.length!==7||new Set(p.rooms.map(r=>r.id)).size!==7)throw Error('Explicit unique rooms in metres required');return {planId:p.id,width_m:dimension(p.width),length_m:dimension(p.length),rooms:p.rooms.map(r=>{if(r.unit!=='m'||typeof r.id!=='string'||!/^[a-z0-9-]{1,40}$/.test(r.id))fail();return {roomId:r.id,x_m:dimension(r.x),y_m:dimension(r.y),width_m:dimension(r.w),length_m:dimension(r.h)};})};});
 const options=geometry.map(p=>{let sum=0n;const rows=p.rooms.map(r=>{const x=fixed(r.x_m),y=fixed(r.y_m),w=fixed(r.width_m),h=fixed(r.length_m);if(w<=0n||h<=0n||x+w>fixed(p.width_m)||y+h>fixed(p.length_m))fail();const value=calculateFloorTakeoff({length_m:r.length_m,width_m:r.width_m,excluded_area_m2:'0'});sum+=fixed(value.net_area_m2);return {roomId:r.roomId,width_m:r.width_m,length_m:r.length_m,area_m2:value.net_area_m2};});for(let i=0;i<p.rooms.length;i++)for(let j=i+1;j<p.rooms.length;j++){const a=p.rooms[i],b=p.rooms[j];if(fixed(a.x_m)<fixed(b.x_m)+fixed(b.width_m)&&fixed(b.x_m)<fixed(a.x_m)+fixed(a.width_m)&&fixed(a.y_m)<fixed(b.y_m)+fixed(b.length_m)&&fixed(b.y_m)<fixed(a.y_m)+fixed(a.length_m))throw Error('Overlapping rooms');}const gross=calculateFloorTakeoff({length_m:p.length_m,width_m:p.width_m,excluded_area_m2:'0'}).net_area_m2;if(sum!==fixed(gross))throw Error('Room coverage mismatch');return {planId:p.planId,rows,total_area_m2:format(sum)};});
 return {schema:'MANA_FURNISHED_TAKEOFF_V1',geometrySha256:createHash('sha256').update(JSON.stringify(geometry)).digest('hex'),unit:'m2',scope:'concept_room_bands_zero_thickness_no_deductions',options};
}
module.exports={takeoffPlans};
