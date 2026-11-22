'use strict';
// Exact, deliberately narrow two-sheet CAD intake. No arbitrary DXF support.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {payloadDigest}=require('../approval-store.cjs');
const SCHEMA='MANA_SYNTHETIC_DXF_INTAKE_V1', PROFILE='MANA_ASCII_R2000_ORTHOGONAL_MM_V1';
const MAX_BYTES=32768,MAX_COORD=100000;
const ids={floor:'FLOOR_OUTLINE',facade:'FACADE_OUTLINE',opening:'OPENING_CONFIRMED'};
const safe=Object.freeze({approvalRequired:true,constructionApproved:false,productionDeploymentAllowed:false,commercialUseAllowed:false,
 modelCalls:0,networkRequests:0,stateWrites:0});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(ok,reason)=>{if(!ok){const e=Error(reason);e.code=reason;throw e;}};
const integer=(value,max)=>typeof value==='string'&&/^(?:0|[1-9][0-9]{0,5})$/u.test(value)&&Number(value)<=max;
const isAscii=b=>b.every(x=>x===10||x===13||(x>=32&&x<=126));
function parseSheet(bytes,layers){
 need(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=MAX_BYTES&&isAscii(bytes),'DXF_ASCII_BOUNDS_REQUIRED');
 const raw=bytes.toString('ascii');
 need(!/\r(?!\n)/u.test(raw),'DXF_LINE_ENDINGS_INVALID');
 const lines=raw.split(/\r?\n/u);
 if(lines.at(-1)==='')lines.pop();
 need(lines.length%2===0&&lines.every(s=>s.length>0&&s.length<=64),'DXF_INCOMPLETE_TAGS');
 let at=0;
 function get(code,value,reason='DXF_PROFILE_UNSUPPORTED'){
  const found=lines[at+1]?.trim();
  need(lines[at]?.trim()===String(code)&&found!==undefined&&(value===undefined||found===value),reason);
  at+=2;return found;
 }
 get(0,'SECTION');get(2,'HEADER');get(9,'$ACADVER');get(1,'AC1015');
 get(9,'$INSUNITS','DXF_EXPLICIT_MILLIMETERS_REQUIRED');get(70,'4','DXF_EXPLICIT_MILLIMETERS_REQUIRED');
 get(0,'ENDSEC');get(0,'SECTION');get(2,'ENTITIES');
 const entities=[],seen=new Set();
 while(lines[at]?.trim()==='0'&&lines[at+1]?.trim()==='LWPOLYLINE'){
  need(entities.length<17,'DXF_ENTITY_LIMIT');
  get(0,'LWPOLYLINE');const handle=get(5);get(100,'AcDbEntity');const layer=get(8);
  need(/^[1-9A-F][0-9A-F]{0,7}$/u.test(handle)&&!seen.has(handle),'DXF_HANDLE_MISSING_OR_DUPLICATE');
  need(layers.includes(layer),'DXF_UNKNOWN_OR_UNCONFIRMED_LAYER');
  seen.add(handle);get(100,'AcDbPolyline');const n=get(90);
  need(integer(n,32)&&Number(n)>=4,'DXF_VERTEX_COUNT_UNSUPPORTED');
  get(70,'1','DXF_CLOSED_STRAIGHT_POLYLINE_REQUIRED');
  const vertices=[];
  for(let i=0;i<Number(n);i++){
   const x=get(10),y=get(20);
   need(integer(x,MAX_COORD)&&integer(y,MAX_COORD),'DXF_INTEGER_COORDINATES_REQUIRED');
   vertices.push([Number(x),Number(y)]);
  }
  entities.push({handle,layer,vertices,entitySha256:payloadDigest({handle,layer,vertices})});
 }
 get(0,'ENDSEC');get(0,'EOF');
 need(at===lines.length,'DXF_TRAILING_TAGS');
 return {sourceSha256:sha(bytes),entities};
}
const overlapInclusive=(a,b)=>Math.max(Math.min(...a),Math.min(...b))<=Math.min(Math.max(...a),Math.max(...b));
const between=(n,values)=>n>=Math.min(...values)&&n<=Math.max(...values);
const axes=(a,b,k)=>[a[k],b[k]];
function touch([a,b],[c,d]){
 const ah=a[1]===b[1],ch=c[1]===d[1];
 if(ah===ch){
  const k=ah?0:1;
  return a[1-k]===c[1-k]&&overlapInclusive(axes(a,b,k),axes(c,d,k));
 }
 return ah?between(c[0],axes(a,b,0))&&between(a[1],axes(c,d,1)):
  between(a[0],axes(c,d,0))&&between(c[1],axes(a,b,1));
}
const abs=x=>x<0n?-x:x;
function measure(e){
 const v=e.vertices,segments=v.map((a,i)=>[a,v[(i+1)%v.length]]);
 const h=segments.map(([a,b])=>a[1]===b[1]);
 need(segments.every(([a,b],i)=>(a[0]===b[0])!==h[i]&&h[i]!==h[(i+1)%h.length]),'DXF_NON_ORTHOGONAL_OR_REDUNDANT_EDGE');
 for(let i=0;i<v.length;i++)for(let j=i+2;j<v.length;j++)if(i!==0||j!==v.length-1)
  need(!touch(segments[i],segments[j]),'DXF_SELF_INTERSECTION_OR_TOUCH');
 const twice=abs(segments.reduce((s,[[x,y],[u,w]])=>s+BigInt(x)*BigInt(w)-BigInt(y)*BigInt(u),0n));
 need(twice>0n&&twice%2n===0n,'DXF_EXACT_AREA_UNAVAILABLE');
 // Independent integer horizontal strip integration, without reading the shoelace result.
 const ys=[...new Set(v.map(p=>p[1]))].sort((a,b)=>a-b);
 let area=0n;
 for(let i=1;i<ys.length;i++){
  const lo=ys[i-1],hi=ys[i];
  const intersections=segments.filter(([a,b])=>a[0]===b[0]&&Math.min(a[1],b[1])<=lo&&Math.max(a[1],b[1])>=hi)
   .map(([a])=>a[0]).sort((a,b)=>a-b);
  need(intersections.length%2===0,'DXF_ORACLE_DISAGREEMENT');
  for(let j=0;j<intersections.length;j+=2)area+=BigInt(intersections[j+1]-intersections[j])*BigInt(hi-lo);
 }
 need(area*2n===twice,'DXF_ORACLE_DISAGREEMENT');
 const x=v.map(p=>p[0]),y=v.map(p=>p[1]),box={x0:Math.min(...x),x1:Math.max(...x),y0:Math.min(...y),y1:Math.max(...y)};
 return {...e,segments,box,area};
}
function rectangle(x){
 need(x.vertices.length===4&&x.area===BigInt(x.box.x1-x.box.x0)*BigInt(x.box.y1-x.box.y0),'DXF_FACADE_RECTANGLES_REQUIRED');
 return x;
}
function contained(a,b){return a.x0>=b.x0&&a.x1<=b.x1&&a.y0>=b.y0&&a.y1<=b.y1;}
function intersects(a,b){return a.x0<b.x1&&b.x0<a.x1&&a.y0<b.y1&&b.y0<a.y1;}
function areaM2(n){
 const s=abs(n).toString().padStart(7,'0'),f=s.slice(-6).replace(/0+$/u,'');
 return (n<0n?'-':'')+s.slice(0,-6)+(f?'.'+f:'');
}
const quantity=n=>({mm2:n.toString(),m2:areaM2(n)});
function ref(sheet,drawing,{layer,handle,entitySha256}){
 return {sheet,sourceSha256:drawing.sourceSha256,layer,handle,entitySha256};
}
function inspectSyntheticDxf({floorBytes,facadeBytes,revision}={}){
 need(typeof revision==='string'&&/^R[1-9][0-9]{0,4}$/u.test(revision),'DXF_REVIEW_REVISION_REQUIRED');
 const plan=parseSheet(floorBytes,[ids.floor]),elevation=parseSheet(facadeBytes,[ids.facade,ids.opening]);
 const shells=elevation.entities.filter(o=>o.layer===ids.facade),holes=elevation.entities.filter(o=>o.layer===ids.opening);
 need(plan.entities.length===1&&shells.length===1&&holes.length>=1,'DXF_MISSING_OR_AMBIGUOUS_GEOMETRY');
 const floor=measure(plan.entities[0]),facade=rectangle(measure(shells[0])),b=facade.box;
 // In this synthetic profile y=0 is the drawn south floor boundary and facade datum.
 const south=floor.segments.filter(([a,c])=>a[1]===0&&c[1]===0).map(([a,c])=>[Math.min(a[0],c[0]),Math.max(a[0],c[0])]);
 need(south.length===1&&b.y0===0&&south[0][0]===b.x0&&south[0][1]===b.x1,'DXF_SOUTH_EDGE_DATUM_OR_SPAN_MISMATCH');
 const openings=holes.map(o=>rectangle(measure(o))).sort((a,c)=>a.handle<c.handle?-1:a.handle>c.handle?1:0);
 for(let i=0;i<openings.length;i++){
  const x=openings[i];
  need(contained(x.box,b)&&x.area<facade.area,'DXF_OPENING_OUTSIDE_SUPPORTED_FACADE');
  for(let j=0;j<i;j++)need(!intersects(x.box,openings[j].box),'DXF_OVERLAPPING_OPENINGS');
 }
 const deductions=openings.reduce((s,o)=>s+o.area,0n);
 need(deductions<facade.area,'DXF_NO_CONFIRMED_NET_SURFACE');
 const fRef=ref('FLOOR',plan,floor),eRef=ref('SOUTH_FACADE',elevation,facade),oRefs=openings.map(o=>ref('SOUTH_FACADE',elevation,o));
 const rows=[
  {id:'FLOOR.GROSS',formula:'ORTHOGONAL_POLYGON_SHOELACE',quantity:quantity(floor.area),sources:[fRef]},
  {id:'SOUTH.GROSS',formula:'FACADE_ENVELOPE_RECTANGLE',quantity:quantity(facade.area),sources:[eRef]},
  ...openings.map((o,i)=>({id:'SOUTH.OPENING.'+o.handle,formula:'CONFIRMED_OPENING_RECTANGLE',quantity:quantity(o.area),sources:[oRefs[i]]})),
  {id:'SOUTH.DEDUCTIONS',formula:'SUM_OF_CONFIRMED_OPENING_AREAS',quantity:quantity(deductions),sources:oRefs},
  {id:'SOUTH.NET',formula:'GROSS_MINUS_CONFIRMED_OPENING_AREAS',quantity:quantity(facade.area-deductions),sources:[eRef,...oRefs]},
 ];
 const core={schema:SCHEMA,status:'SYNTHETIC_GEOMETRY_READBACK_REVIEW_REQUIRED',revision,profile:PROFILE,inputUnit:'mm',
  roleMapping:'SYNTHETIC_SOUTH_AT_FLOOR_Y_ZERO',planSha256:plan.sourceSha256,facadeSha256:elevation.sourceSha256,
  arithmeticCheck:'INDEPENDENT_INTEGER_HORIZONTAL_STRIPS',scope:'SYNTHETIC_TEST_ONLY_NOT_PROJECT_MEASUREMENT',
  netScope:'ONLY_EXPLICIT_CONFIRMED_OPENING_ENTITIES_NOT_CONTRACTUAL',rows,...safe};
 return {...core,reportSha256:payloadDigest(core)};
}
function compareSyntheticDxf(before,after){
 const a=inspectSyntheticDxf(before),b=inspectSyntheticDxf(after);
 need(Number(b.revision.slice(1))>Number(a.revision.slice(1)),'DXF_REVISION_ORDER_INVALID');
 const prior=new Map(a.rows.map(x=>[x.id,x])),next=new Map(b.rows.map(x=>[x.id,x]));
 const changes=[...new Set([...prior.keys(),...next.keys()])].sort().map(id=>{
  const x=prior.get(id),y=next.get(id),difference=BigInt(y?.quantity.mm2??0)-BigInt(x?.quantity.mm2??0);
  return {id,beforeM2:x?.quantity.m2??null,afterM2:y?.quantity.m2??null,deltaM2:areaM2(difference),
   sourceEntityChanged:!x||!y||payloadDigest(x.sources.map(v=>v.entitySha256))!==payloadDigest(y.sources.map(v=>v.entitySha256)),
   change:!x?'ADDED':!y?'REMOVED':difference!==0n?'QUANTITY_CHANGED':'NO_QUANTITY_CHANGE'};
 });
 const core={schema:'MANA_SYNTHETIC_DXF_REVISION_V1',status:'SYNTHETIC_REVISION_REVIEW_REQUIRED',
  beforeRevision:a.revision,afterRevision:b.revision,beforeReportSha256:a.reportSha256,afterReportSha256:b.reportSha256,
  scope:a.scope,changes,...safe};
 return {...core,reportSha256:payloadDigest(core)};
}
function readLocal(p){
 need(typeof p==='string'&&p.length<4096&&p.endsWith('.dxf')&&path.isAbsolute(p)&&path.resolve(p)===p&&fs.realpathSync(p)===p,'DXF_CANONICAL_LOCAL_PATH_REQUIRED');
 const c=fs.constants,fd=fs.openSync(p,c.O_RDONLY|c.O_NOFOLLOW|c.O_NONBLOCK);
 try{
  const s=fs.fstatSync(fd);
  need(s.isFile()&&s.size>0&&s.size<=MAX_BYTES,'DXF_ASCII_BOUNDS_REQUIRED');
  const b=Buffer.alloc(s.size+1);let at=0;
  while(at<b.length){const n=fs.readSync(fd,b,at,b.length-at,null);if(!n)break;at+=n;}
  const end=fs.fstatSync(fd);
  need(at===s.size&&end.size===s.size&&end.mtimeMs===s.mtimeMs&&end.ctimeMs===s.ctimeMs,'DXF_INPUT_CHANGED');
  return b.subarray(0,at);
 }finally{fs.closeSync(fd);}
}
const pair=([revision,floorName,facadeName])=>({revision,floorBytes:readLocal(floorName),facadeBytes:readLocal(facadeName)});
if(require.main===module){
 try{
  const [op,...a]=process.argv.slice(2);
  need(op==='inspect'&&a.length===3||op==='compare'&&a.length===6,'DXF_COMMAND_INVALID');
  const out=op==='inspect'?inspectSyntheticDxf(pair(a)):compareSyntheticDxf(pair(a),pair(a.slice(3)));
  console.log(JSON.stringify(out));
 }catch(e){
  console.log(JSON.stringify({schema:SCHEMA,status:'ABSTAIN_NO_QUANTITY',reasonCode:typeof e?.code==='string'&&/^DXF_[A-Z_]+$/u.test(e.code)?e.code:'DXF_LOCAL_SOURCE_UNAVAILABLE',...safe}));
  process.exitCode=1;
 }
}
module.exports={inspectSyntheticDxf,compareSyntheticDxf};
