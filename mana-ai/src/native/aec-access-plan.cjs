'use strict';
/** Pure deterministic schematic access model; not an egress or code-compliance checker. */
const crypto = require('node:crypto');
const MM=1000;
function mm(v,name){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1000||Math.abs(v*MM-Math.round(v*MM))>1e-6)throw Error('Invalid '+name);return Math.round(v*MM);}
function object(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
function key(a,b){return [a,b].sort().join('|');}
function validate(layout,opts={}){
 if(!object(layout)||layout.schema!=='MANA_AEC_LAYOUT_V1'||layout.status!=='FEASIBLE_SCHEMATIC_LAYOUT'||!Array.isArray(layout.rooms)||!layout.rooms.length||layout.rooms.length>10)throw Error('Feasible V1 layout required');
 if(!object(opts)||Object.keys(opts).some(k=>!['entryRoomId','doorWidthM','windowWidthM','minJambM','requireWindowRooms'].includes(k)))throw Error('Invalid options');
 const w=mm(opts.doorWidthM??0.9,'doorWidthM'),win=mm(opts.windowWidthM??1.2,'windowWidthM'),jamb=mm(opts.minJambM??0.15,'minJambM');
 if(w<700||w>1800||win<600||win>3000||jamb<100||jamb>1000)throw Error('Opening sizes out of schematic bounds');
 const ids=new Set(),rooms=layout.rooms.map(r=>{
  if(!object(r)||typeof r.id!=='string'||!/^[a-z][a-z0-9_]{0,39}$/.test(r.id)||ids.has(r.id))throw Error('Invalid room id');ids.add(r.id);
  const x=mm(r.xM,'x'),y=mm(r.yM,'y'),rw=mm(r.widthM,'room width'),rh=mm(r.depthM,'room depth');
  if(!rw||!rh||x+rw>100000||y+rh>100000)throw Error('Invalid room dimensions');
  return {id:r.id,x,y,w:rw,h:rh};
 });
 for(let i=0;i<rooms.length;i++)for(let z=i+1;z<rooms.length;z++){
  const a=rooms[i],b=rooms[z];if(a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h)throw Error('Rooms overlap');
 }
 const required=new Set();for(const pair of layout.requiredAdjacencies??[]){if(!Array.isArray(pair)||pair.length!==2||!ids.has(pair[0])||!ids.has(pair[1])||pair[0]===pair[1])throw Error('Invalid adjacency');required.add(key(...pair));}
 const maxX=Math.max(...rooms.map(r=>r.x+r.w)),maxY=Math.max(...rooms.map(r=>r.y+r.h));
 const outer=rooms.filter(r=>r.x===0||r.y===0||r.x+r.w===maxX||r.y+r.h===maxY);
 const entry=opts.entryRoomId??outer[0]?.id;if(!ids.has(entry))throw Error('Unknown entry room');
 const entryRoom=rooms.find(r=>r.id===entry);if(!outer.includes(entryRoom))throw Error('Entry room has no exterior edge');
 const requiredWindows=opts.requireWindowRooms??[];if(!Array.isArray(requiredWindows)||new Set(requiredWindows).size!==requiredWindows.length||requiredWindows.some(id=>!ids.has(id)))throw Error('Invalid window requirements');
 return {rooms,required,entry,w,win,jamb,maxX,maxY,requiredWindows};
}
function commonWall(a,b){
 if(a.x+a.w===b.x||b.x+b.w===a.x){const lo=Math.max(a.y,b.y),hi=Math.min(a.y+a.h,b.y+b.h);if(hi>lo)return {axis:'x',value:a.x+a.w===b.x?b.x:a.x,lo,hi};}
 if(a.y+a.h===b.y||b.y+b.h===a.y){const lo=Math.max(a.x,b.x),hi=Math.min(a.x+a.w,b.x+b.w);if(hi>lo)return {axis:'y',value:a.y+a.h===b.y?b.y:a.y,lo,hi};}
 return null;
}
function segment(axis,value,lo,hi){return {axis,atM:value/MM,fromM:lo/MM,toM:hi/MM};}
function centered(wall,width,jamb){if(wall.hi-wall.lo<width+2*jamb)return null;const from=wall.lo+Math.floor((wall.hi-wall.lo-width)/2);return {...segment(wall.axis,wall.value,from,from+width),widthM:width/MM};}
function outsideWalls(r,W,H){const result=[];if(r.x===0)result.push({axis:'x',value:0,lo:r.y,hi:r.y+r.h,side:'west'});if(r.x+r.w===W)result.push({axis:'x',value:W,lo:r.y,hi:r.y+r.h,side:'east'});if(r.y===0)result.push({axis:'y',value:0,lo:r.x,hi:r.x+r.w,side:'south'});if(r.y+r.h===H)result.push({axis:'y',value:H,lo:r.x,hi:r.x+r.w,side:'north'});return result;}
function plan(layout,options={}){
 const v=validate(layout,options),{rooms,w,win,jamb,maxX,maxY,entry,required,requiredWindows}=v;
 const edges=[];for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
  const wall=commonWall(rooms[i],rooms[j]);if(!wall)continue;edges.push({a:rooms[i].id,b:rooms[j].id,wall,required:required.has(key(rooms[i].id,rooms[j].id))});
 }
 // Prefer required edges, then others. Spanning tree gives an entrance-reachable circulation skeleton.
 edges.sort((a,b)=>Number(b.required)-Number(a.required)||key(a.a,a.b).localeCompare(key(b.a,b.b)));
 const reachable=new Set([entry]),doors=[],unused=[];
 for(let pass=0;pass<rooms.length;pass++){
  let progress=false;for(const e of edges){if(reachable.has(e.a)===reachable.has(e.b))continue;
   const opening=centered(e.wall,w,jamb);
   if(!opening){unused.push({rooms:[e.a,e.b],reason:'INSUFFICIENT_SHARED_WALL'});continue;}
   doors.push({id:'door_'+(doors.length+1),between:[e.a,e.b],...opening});reachable.add(e.a);reachable.add(e.b);progress=true;
  }if(!progress)break;
 }
 // Add every required adjacency as a real door when feasible, including cycle edges.
 const existing=new Set(doors.map(d=>key(...d.between))),missingRequired=[];
 for(const e of edges.filter(e=>e.required&&!existing.has(key(e.a,e.b)))){const opening=centered(e.wall,w,jamb);if(!opening){missingRequired.push([e.a,e.b]);continue;}doors.push({id:'door_'+(doors.length+1),between:[e.a,e.b],...opening});}
 for(const pair of required){if(!edges.some(e=>key(e.a,e.b)===pair))missingRequired.push(pair.split('|'));}
 const entRoom=rooms.find(r=>r.id===entry),exterior=outsideWalls(entRoom,maxX,maxY);
 const entranceWall=exterior.map(t=>({wall:t,opening:centered(t,w,jamb)})).find(x=>x.opening);
 if(!entranceWall)throw Error('Exterior entry opening cannot fit');
 const entrance={id:'entrance',room:entry,side:entranceWall.wall.side,...entranceWall.opening};
 const windows=[],missing=[];
 for(const r of rooms){const outside=outsideWalls(r,maxX,maxY);let placed=null;
  for(const wall of outside){const op=centered(wall,win,jamb);if(!op)continue;
   if(r.id===entry&&wall.side===entranceWall.wall.side&&wall.value===entranceWall.wall.value)continue;
   placed={id:'window_'+r.id,room:r.id,side:wall.side,...op};break;
  }
  if(placed)windows.push(placed);else if(requiredWindows.includes(r.id))missing.push(r.id);
 }
 const inaccessible=rooms.filter(r=>!reachable.has(r.id)).map(r=>r.id);
 const status=inaccessible.length||missing.length||missingRequired.length?'ACCESS_REVIEW_REQUIRED':'SCHEMATIC_ACCESS_CONNECTED';
 return {schema:'MANA_AEC_ACCESS_V1',projectId:layout.projectId,status,units:'m',entryRoomId:entry,entrance,doors,windows,inaccessibleRooms:inaccessible,missingRequiredWindows:missing,missingRequiredDoorConnections:missingRequired,requiredAdjacentPairs:[...required],unavailableConnections:unused,limitations:['Not a building-code, fire-egress, accessibility or construction-drawing validation','Exterior envelope inferred from room bounds; confirm real site boundary','Door swing, hardware, circulation clearances and furniture not validated','Windows are conceptual; orientation, daylight and structural constraints unverified']};
}
function dxf(report){if(!report||report.schema!=='MANA_AEC_ACCESS_V1')throw Error('Access report required');
 const rows=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1009','0','ENDSEC','0','SECTION','2','ENTITIES'];
 const line=(layer,a,b,c,d)=>rows.push('0','LINE','8',layer,'10',String(a),'20',String(b),'30','0','11',String(c),'21',String(d),'31','0');
 const opening=(layer,o)=>{const a=o.axis==='x'?[o.atM,o.fromM,o.atM,o.toM]:[o.fromM,o.atM,o.toM,o.atM];line(layer,...a);};
 opening('ENTRY_OPENING',report.entrance);for(const item of report.doors)opening('DOOR_LOCATIONS',item);for(const item of report.windows)opening('WINDOW_LOCATIONS',item);
 rows.push('0','ENDSEC','0','EOF');return rows.join('\n')+'\n';
}
function generate(layout,options){const report=plan(layout,options),files={'access.json':JSON.stringify(report,null,2)+'\n','access-overlays.dxf':dxf(report)};return {report,files,sha256:Object.fromEntries(Object.entries(files).map(([name,data])=>[name,crypto.createHash('sha256').update(data).digest('hex')]))};}
module.exports={validate,commonWall,plan,dxf,generate};
