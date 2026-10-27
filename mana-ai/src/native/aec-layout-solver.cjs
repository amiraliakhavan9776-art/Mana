'use strict';
/** Deterministic rectangular layout feasibility solver. Does not establish code compliance. */
const crypto=require('node:crypto');
const PREC=1000, integer=(v,name,min,max)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||Math.round(v*PREC)!==v*PREC)throw Error('Invalid '+name);return Math.round(v*PREC)};
const id=x=>typeof x==='string'&&/^[a-z][a-z0-9_]{0,39}$/.test(x);
function validate(s){
 if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).sort().join('|')!=='adjacencies|depthM|projectId|rooms|widthM')throw Error('Invalid layout specification');
 if(!id(s.projectId))throw Error('Invalid projectId');
 const w=integer(s.widthM,'widthM',2,100),h=integer(s.depthM,'depthM',2,100);
 if(!Array.isArray(s.rooms)||s.rooms.length<2||s.rooms.length>10)throw Error('2-10 rooms required');
 const seen=new Set();let total=0;const rooms=s.rooms.map((r,i)=>{
  if(!r||Object.keys(r).sort().join('|')!=='depthM|id|widthM'||!id(r.id)||seen.has(r.id))throw Error('Invalid or duplicate room');
  seen.add(r.id);const rw=integer(r.widthM,'room widthM',1,100),rh=integer(r.depthM,'room depthM',1,100);
  total+=rw*rh;return {id:r.id,w:rw,h:rh,index:i};
 });
 if(total>w*h)throw Error('ROOM_AREA_EXCEEDS_ENVELOPE');
 if(!Array.isArray(s.adjacencies)||s.adjacencies.length>20)throw Error('Invalid adjacencies');
 const edges=new Set();for(const pair of s.adjacencies){
  if(!Array.isArray(pair)||pair.length!==2||pair[0]===pair[1]||!seen.has(pair[0])||!seen.has(pair[1]))throw Error('Invalid adjacency');
  const key=[...pair].sort().join('|');if(edges.has(key))throw Error('Duplicate adjacency');edges.add(key);
 }
 return {w,h,rooms,adjacencies:s.adjacencies};
}
const overlap=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
function shared(a,b){
 const vertical=(a.x+a.w===b.x||b.x+b.w===a.x)?Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)):0;
 const horizontal=(a.y+a.h===b.y||b.y+b.h===a.y)?Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)):0;
 return Math.max(vertical,horizontal);
}
function solve(spec,{maxNodes=40000}={}){
 const {w,h,rooms,adjacencies}=validate(spec);
 if(!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>1000000)throw Error('Invalid search budget');
 // Explore extreme-coordinate placements and 90-degree orientations; deterministic.
 let nodes=0,solution=null;
 const order=[...rooms].sort((a,b)=>(b.w*b.h-a.w*a.h)||a.id.localeCompare(b.id));
 const byId=new Map(order.map(r=>[r.id,r]));
 const dfs=(placed)=>{
  if(nodes>=maxNodes)return false;
  if(placed.length===order.length){
   const lookup=new Map(placed.map(r=>[r.id,r]));
   if(adjacencies.every(([a,b])=>shared(lookup.get(a),lookup.get(b))>=500)){solution=placed;return true}return false;
  }
  const r=order[placed.length],variants=[{w:r.w,h:r.h}];if(r.w!==r.h)variants.push({w:r.h,h:r.w});
  const xs=[0,...placed.map(v=>v.x+v.w)],ys=[0,...placed.map(v=>v.y+v.h)];
  for(const dims of variants)for(const x of [...new Set(xs)].sort((a,b)=>a-b))for(const y of [...new Set(ys)].sort((a,b)=>a-b)){
   if(++nodes>maxNodes)return false;
   const box={id:r.id,x,y,...dims,rotated:dims.w!==r.w};
   if(x+box.w>w||y+box.h>h||placed.some(v=>overlap(v,box)))continue;
   // If an adjacency pair has both endpoints placed, it must have a shared 0.5m wall.
   const withBox=new Map([...placed,box].map(v=>[v.id,v]));
   if(adjacencies.some(([a,b])=>withBox.has(a)&&withBox.has(b)&&shared(withBox.get(a),withBox.get(b))<500))continue;
   if(dfs([...placed,box]))return true;
  }
  return false;
 };
 dfs([]);
 const status=solution?'FEASIBLE_SCHEMATIC_LAYOUT':nodes>=maxNodes?'SEARCH_BUDGET_EXHAUSTED':'NO_LAYOUT_FOUND_UNDER_SEARCH_POLICY';
 const zones=solution?solution.sort((a,b)=>byId.get(a.id).index-byId.get(b.id).index).map(r=>({id:r.id,xM:r.x/PREC,yM:r.y/PREC,widthM:r.w/PREC,depthM:r.h/PREC,rotated:r.rotated,areaM2:r.w*r.h/(PREC*PREC)})):[];
 const report={schema:'MANA_AEC_LAYOUT_V1',projectId:spec.projectId,status,units:'m',searchNodes:nodes,maxNodes,rooms:zones,requiredAdjacencies:adjacencies,validatedAdjacencies:solution?adjacencies.map(([a,b])=>({rooms:[a,b],sharedBoundaryM:shared(solution.find(x=>x.id===a),solution.find(x=>x.id===b))/PREC})):[],limitations:['Schematic rectangle placement only','No door/window/circulation/egress/structure/building code verification','Search policy is incomplete: no solution does not prove geometric impossibility']};
 return report;
}
function toDXF(spec,report){if(report.status!=='FEASIBLE_SCHEMATIC_LAYOUT')throw Error('No feasible layout to export');
 const rows=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1009','0','ENDSEC','0','SECTION','2','ENTITIES'];
 const line=(layer,x,y,u,v)=>rows.push('0','LINE','8',layer,'10',String(x),'20',String(y),'30','0','11',String(u),'21',String(v),'31','0');
 const rect=(layer,x,y,w,h)=>{line(layer,x,y,x+w,y);line(layer,x+w,y,x+w,y+h);line(layer,x+w,y+h,x,y+h);line(layer,x,y+h,x,y)};
 rect('ENVELOPE',0,0,spec.widthM,spec.depthM);
 for(const r of report.rooms)rect('ROOMS',r.xM,r.yM,r.widthM,r.depthM);
 rows.push('0','ENDSEC','0','EOF');return rows.join('\n')+'\n';
}
function generate(spec,options){const report=solve(spec,options),files={'layout.json':JSON.stringify(report,null,2)+'\n'};
 if(report.status==='FEASIBLE_SCHEMATIC_LAYOUT')files['layout.dxf']=toDXF(spec,report);
 return {report,files,sha256:Object.fromEntries(Object.entries(files).map(([key,value])=>[key,crypto.createHash('sha256').update(value).digest('hex')]))};
}
module.exports={validate,solve,toDXF,generate};
