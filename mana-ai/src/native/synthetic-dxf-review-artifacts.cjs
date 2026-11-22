'use strict';
// Generate only synthetic review CSV/SVG from the original pinned DXFs, never production artifacts.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {payloadDigest}=require('../approval-store.cjs');
const {inspectSyntheticDxf,compareSyntheticDxf}=require('./synthetic-aec-dxf.cjs');
const {buildSyntheticDxfRevision}=require('./synthetic-dxf-revision-impact.cjs');
const FIXTURES={floorBytes:'floor-r1-r2.dxf',beforeFacadeBytes:'south-facade-r1.dxf',afterFacadeBytes:'south-facade-r2.dxf'};
const CSV_ID='SYNTHETIC-REVIEW-QTY-R1-R2',SVG_ID='SYNTHETIC-REVIEW-ELEV-R1-R2';
const sha=b=>createHash('sha256').update(b).digest('hex');
const requireOk=v=>{if(!v)throw Error('SYNTHETIC_REVIEW_INPUT_NOT_VERIFIED');};
const esc=v=>String(v).replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function readFile(name){
 const p=path.resolve(__dirname,'../../examples/synthetic-aec-dxf',name),c=fs.constants;
 requireOk(fs.realpathSync(p)===p);
 const fd=fs.openSync(p,c.O_RDONLY|c.O_NOFOLLOW|c.O_NONBLOCK);
 try{
  const s=fs.fstatSync(fd);requireOk(s.isFile()&&s.size>0&&s.size<=32768);
  const b=Buffer.alloc(s.size+1);let n=0;
  while(n<b.length){const k=fs.readSync(fd,b,n,b.length-n,null);if(!k)break;n+=k;}
  requireOk(n===s.size);return b.subarray(0,n);
 }finally{fs.closeSync(fd);}
}
// Projection only, after the strict original two-sheet validator and exact input pins.
// Require all handles, layers, and integer vertices to match the original calculation's entity digest.
function project(bytes,sources){
 const lines=bytes.toString('ascii').trimEnd().split(/\r?\n/u).map(s=>s.trim()),entities=[];
 for(let i=0;i<lines.length;i+=2)if(lines[i]==='0'&&lines[i+1]==='LWPOLYLINE'){
  const handle=lines[i+3],layer=lines[i+7],n=Number(lines[i+11]),vertices=[];
  for(let j=0;j<n;j++){
   const at=i+14+j*4;
   requireOk(lines[at]==='10'&&lines[at+2]==='20'&&/^\d+$/u.test(lines[at+1])&&/^\d+$/u.test(lines[at+3]));
   vertices.push([Number(lines[at+1]),Number(lines[at+3])]);
  }
  const expected=sources.find(x=>x.handle===handle),actual={handle,layer,vertices};
  requireOk(expected&&expected.sourceSha256===sha(bytes)&&expected.entitySha256===payloadDigest(actual));
  entities.push(actual);
 }
 requireOk(entities.length===sources.length&&new Set(entities.map(x=>x.handle)).size===entities.length);
 return entities;
}
const row=(report,id)=>report.rows.find(x=>x.id===id);
function csv(a,b,delta,impact){
 const head=['artifact_id','classification','record_type','revision','quantity_id','value_m2','value_mm2','geometry_unit',
  'source_refs','dxf_report_sha256','revision_impact_sha256'];
 const record=(report,type,id,m2,mm2,sources,hash)=>[CSV_ID,'SYNTHETIC_NOT_FOR_CONSTRUCTION',type,report,id,m2,mm2,'mm',
  sources.map(s=>[s.sheet,s.layer,s.handle,s.sourceSha256,s.entitySha256].join(':')).join('|'),hash,impact.reportSha256];
 const rows=[head];
 for(const report of [a,b])for(const r of report.rows)
  rows.push(record(report.revision,'geometric_area',r.id,r.quantity.m2,r.quantity.mm2,r.sources,report.reportSha256));
 for(const change of delta.changes){
  const x=row(a,change.id),y=row(b,change.id);
  requireOk(x&&y);
  const refs=[...x.sources,...y.sources];
  rows.push(record('R1_TO_R2','geometric_delta',change.id,change.deltaM2,(BigInt(y.quantity.mm2)-BigInt(x.quantity.mm2)).toString(),
   refs,delta.reportSha256));
 }
 return rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
}
function bounds({vertices:v}){
 const x=v.map(p=>p[0]),y=v.map(p=>p[1]);
 return {x0:Math.min(...x),x1:Math.max(...x),y0:Math.min(...y),y1:Math.max(...y)};
}
function view(b){return [b.x0,b.y0,b.x1-b.x0,b.y1-b.y0].join(' ');}
function polygon(p,cls){
 return `<polygon class="${cls}" data-handle="${esc(p.handle)}" data-layer="${esc(p.layer)}" points="${p.vertices.map(v=>v.join(',')).join(' ')}"/>`;
}
const label=(id,x,y,value,cls='text')=>`<text id="${id}" x="${x}" y="${y}" class="${cls}">${esc(value)}</text>`;
function chart(a,b,floor,before,after,impact){
 const b0=bounds(before.find(x=>x.handle==='20')),b1=bounds(after.find(x=>x.handle==='20')),fb=bounds(floor[0]);
 const w0=bounds(before.find(x=>x.handle==='21')),w1=bounds(after.find(x=>x.handle==='21'));
 requireOk(view(b0)===view(b1)&&w0.x0===w1.x0&&w0.y0===w1.y0&&w0.y1===w1.y1&&w1.x1>w0.x1);
 const clip=`<rect id="added-opening-region" x="${w0.x1}" y="${w0.y0}" width="${w1.x1-w0.x1}" height="${w0.y1-w0.y0}" class="change"/>`;
 const pane=(id,x,report,polys,bb,extra='')=>[
  `<rect x="${x-18}" y="102" width="552" height="299" rx="14" class="card"/>`,
  label(id+'-title',x,137,report.revision+' / SOUTH ELEVATION','sub'),
  `<svg id="${id}" x="${x}" y="154" width="516" height="195" viewBox="${view(bb)}" preserveAspectRatio="xMidYMid meet" data-unit="mm" data-source-id="FACADE-SOUTH-001" data-revision="${report.revision}" data-source-sha256="${report.facadeSha256}"><g transform="translate(0 ${bb.y1+bb.y0}) scale(1 -1)">${polys.map(p=>polygon(p,p.handle==='20'?'shell':p.handle==='21'?'opening-selected':'opening')).join('')}${extra}</g></svg>`,
  label(id+'-net',x,378,`Gross ${row(report,'SOUTH.GROSS').quantity.m2} m² | Net ${row(report,'SOUTH.NET').quantity.m2} m²`,'metric'),
 ].join('\n');
 return [
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="804" viewBox="0 0 1200 804" role="img" aria-labelledby="title description" data-artifact-id="${SVG_ID}" data-impact-sha256="${impact.reportSha256}">`,
  '<title id="title">South elevation R1 to R2 / synthetic review</title>',
  '<desc id="description">Two matching-scale elevations and the unchanged floor outline; the right panel marks the increase in opening 21.</desc>',
  '<style>.back{fill:#f4efe7}.card{fill:#fffcf6;stroke:#ded3c3}.kicker{font:700 14px sans-serif;fill:#8b3f24;letter-spacing:2px}.headline{font:700 34px sans-serif;fill:#202d38}.sub{font:700 18px sans-serif;fill:#202d38}.text{font:16px sans-serif;fill:#344653}.metric{font:700 19px sans-serif;fill:#202d38}.small{font:13px sans-serif;fill:#52626b}.hash{font:11px monospace;fill:#344653}.shell,.floor,.opening,.opening-selected,.change{stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round}.shell,.floor{fill:#eadac6;stroke:#344653}.opening{fill:#fffdf6;stroke:#52626b}.opening-selected{fill:#fff4df;stroke:#994827}.change{fill:#edab84;stroke:#994827}</style>',
  '<rect width="1200" height="804" class="back"/>',
  label('warning',42,34,'SYNTHETIC REVIEW SAMPLE / NOT FOR CONSTRUCTION','kicker'),
  label('heading',42,78,'South elevation / R1 → R2','headline'),
  pane('facade-r1',42,a,before,b0),pane('facade-r2',630,b,after,b1,clip),
  '<rect x="24" y="418" width="1152" height="275" rx="14" class="card"/>',
  label('floor-title',42,453,'FLOOR OUTLINE / UNCHANGED','sub'),
  `<svg id="floor" x="42" y="465" width="302" height="180" viewBox="${view(fb)}" preserveAspectRatio="xMidYMid meet" data-unit="mm" data-source-id="ARCH-FLOOR-001" data-revision="FLOOR-R1" data-source-sha256="${a.planSha256}"><g transform="translate(0 ${fb.y1+fb.y0}) scale(1 -1)">${polygon(floor[0],'floor')}</g></svg>`,
  label('floor-area',42,675,`Floor gross ${row(a,'FLOOR.GROSS').quantity.m2} m² in both revisions`,'metric'),
  label('opening',413,477,`Opening 21: ${impact.measured.opening.beforeM2} → ${impact.measured.opening.afterM2} m²`,'metric'),
  label('opening-key',413,506,'Orange band: measured addition to opening 21 (stipulated window)'),
  label('unchanged',413,534,'Opening 22 and floor outline unchanged.'),
  label('net-delta',413,562,`Net geometric area delta: ${impact.measured.southNet.deltaM2} m²`,'metric'),
  label('units',413,594,'Geometry coordinates: mm. Areas: m². Elevations use identical scale.'),
  label('layout',413,622,`Facade span ${b0.x1-b0.x0} mm | height ${b0.y1-b0.y0} mm. Floor inset has its own scale.`),
  label('interpretation',413,650,'Review aid only: no design, installation, structural or contract approval.','small'),
  label('source-r1',42,726,`FACADE-SOUTH-001 / R1 / ${a.facadeSha256}`,'hash'),
  label('source-r2',42,748,`FACADE-SOUTH-001 / R2 / ${b.facadeSha256}`,'hash'),
  label('source-floor',42,770,`ARCH-FLOOR-001 / FLOOR-R1 / ${a.planSha256}`,'hash'),
  '</svg>',
 ].join('\n')+'\n';
}
function makeArtifacts(){
 const bytes=Object.fromEntries(Object.entries(FIXTURES).map(([k,v])=>[k,readFile(v)]));
 const impact=buildSyntheticDxfRevision(bytes),prev={revision:'R1',floorBytes:bytes.floorBytes,facadeBytes:bytes.beforeFacadeBytes};
 const next={revision:'R2',floorBytes:bytes.floorBytes,facadeBytes:bytes.afterFacadeBytes};
 const a=inspectSyntheticDxf(prev),b=inspectSyntheticDxf(next),delta=compareSyntheticDxf(prev,next);
 requireOk(delta.reportSha256===impact.source.dxfComparisonSha256);
 const floor=project(bytes.floorBytes,row(a,'FLOOR.GROSS').sources);
 const first=project(bytes.beforeFacadeBytes,row(a,'SOUTH.NET').sources),second=project(bytes.afterFacadeBytes,row(b,'SOUTH.NET').sources);
 const outputs={csv:csv(a,b,delta,impact),svg:chart(a,b,floor,first,second,impact)};
 const manifest={schema:'MANA_SYNTHETIC_DXF_REVIEW_ARTIFACTS_V1',status:'SYNTHETIC_ARTIFACTS_REVIEW_ONLY',
  impactReportSha256:impact.reportSha256,source:impact.source,
  artifacts:Object.entries(outputs).map(([type,v])=>({id:type==='csv'?CSV_ID:SVG_ID,type,bytes:Buffer.byteLength(v),sha256:sha(v)})),
  downstreamArtifactsRegenerated:false,constructionApproved:false,productionDeploymentAllowed:false,actionsExecuted:0,stateWrites:0};
 return {...outputs,manifest};
}
if(require.main===module){
 try{
  const [format,...extra]=process.argv.slice(2);
  requireOk(!extra.length&&['csv','svg','manifest'].includes(format));
  const r=makeArtifacts();
  process.stdout.write(format==='manifest'?JSON.stringify(r.manifest)+'\n':r[format]);
 }catch{
  console.error('SYNTHETIC_REVIEW_ARTIFACTS_UNVERIFIED');
  process.exitCode=1;
 }
}
module.exports={makeArtifacts};
