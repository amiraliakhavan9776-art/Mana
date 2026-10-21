'use strict';
/** Mana AI facade pilot: deterministic rectangular elevation + opening takeoff.
 * Inputs are metres; output is a schematic DXF, SVG sheet and CSV takeoff.
 * NOT an engineered construction drawing. No dependencies; Node 20+.
 */
const fs = require('node:fs');
const path = require('node:path');
function positive(n, label) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 10000) throw Error(label + ' must be a positive finite number <= 10000');
  return n;
}
function text(s, label) {
  if (typeof s !== 'string' || !s.trim() || s.length > 120) throw Error('Invalid ' + label);
  return s.trim();
}
function rect(x,y,w,h) { return {x,y,w,h}; }
function overlap(a,b) { return a.x < b.x+b.w && b.x < a.x+a.w && a.y < b.y+b.h && b.y < a.y+a.h; }
function analyze(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Input must be an object');
  const project = text(input.project, 'project');
  const width = positive(input.width, 'width');
  const height = positive(input.height, 'height');
  const material = text(input.material, 'material');
  const wastePercent = input.wastePercent === undefined ? 10 : input.wastePercent;
  if (typeof wastePercent !== 'number' || !Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent > 100) throw Error('Invalid wastePercent');
  if (!Array.isArray(input.openings) || input.openings.length > 500) throw Error('openings must be an array (max 500)');
  const openings = input.openings.map((o,i)=>{
    if (!o || typeof o !== 'object') throw Error('Invalid opening '+i);
    const x=o.x,y=o.y,w=positive(o.width,'opening width'),h=positive(o.height,'opening height');
    if (![x,y].every(v=>typeof v==='number' && Number.isFinite(v) && v>=0)) throw Error('Invalid opening origin '+i);
    if (x+w > width+1e-8 || y+h > height+1e-8) throw Error('Opening outside elevation '+i);
    return {...rect(x,y,w,h), id:text(o.id || 'O'+(i+1),'opening id')};
  });
  for(let i=0;i<openings.length;i++) for(let j=i+1;j<openings.length;j++) if(overlap(openings[i],openings[j])) throw Error('Overlapping openings '+openings[i].id+' / '+openings[j].id);
  const gross=width*height, deductions=openings.reduce((s,o)=>s+o.w*o.h,0), net=gross-deductions;
  return {project,width,height,material,wastePercent,openings,gross,deductions,net,order:net*(1+wastePercent/100)};
}
const round=n=>Number(n.toFixed(4));
function csv(a) {
  const q=s=>'"'+String(s).replace(/"/g,'""')+'"';
  const rows=[['item','reference','description','length_m','height_m','quantity_m2','formula'],['F-001','ELEV-01','Gross elevation',a.width,a.height,round(a.gross),'width*height']];
  a.openings.forEach(o=>rows.push(['F-001',o.id,'Opening deduction',o.w,o.h,-round(o.w*o.h),'-width*height']));
  rows.push(['F-001','NET',a.material,'','',round(a.net),'gross - openings'],['F-001','WASTE','Waste '+a.wastePercent+'%','','',round(a.order-a.net),'net * waste / 100'],['F-001','ORDER','Estimated order quantity','','',round(a.order),'net + waste']);
  return '\uFEFF'+rows.map(r=>r.map(q).join(',')).join('\r\n')+'\r\n';
}
function dxf(a) {
  const p=[]; const emit=(...x)=>p.push(...x.map(String));
  const line=(x1,y1,x2,y2)=>emit(0,'LINE',8,'FACADE',10,x1,20,y1,30,0,11,x2,21,y2,31,0);
  const rectangle=r=>{line(r.x,r.y,r.x+r.w,r.y);line(r.x+r.w,r.y,r.x+r.w,r.y+r.h);line(r.x+r.w,r.y+r.h,r.x,r.y+r.h);line(r.x,r.y+r.h,r.x,r.y)};
  emit(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1009',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
  rectangle(rect(0,0,a.width,a.height));a.openings.forEach(rectangle);
  emit(0,'ENDSEC',0,'EOF');return p.join('\n')+'\n';
}
const escapeXml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function svg(a) {
  const W=1190,H=841, maxW=950,maxH=620,scale=Math.min(maxW/a.width,maxH/a.height),ox=95,oy=105;
  const box=r=>'<rect x="'+(ox+r.x*scale)+'" y="'+(oy+(a.height-r.y-r.h)*scale)+'" width="'+(r.w*scale)+'" height="'+(r.h*scale)+'" fill="none" stroke="#222" stroke-width="1.5"/>';
  const labels=a.openings.map(o=>'<text x="'+(ox+(o.x+o.w/2)*scale)+'" y="'+(oy+(a.height-o.y-o.h/2)*scale)+'" font-size="12" text-anchor="middle">'+escapeXml(o.id)+'</text>').join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1190" height="841" viewBox="0 0 1190 841"><rect width="1190" height="841" fill="white"/><rect x="20" y="20" width="1150" height="801" fill="none" stroke="#222" stroke-width="2"/><text x="65" y="65" font-size="25">'+escapeXml(a.project)+'</text>'+box(rect(0,0,a.width,a.height))+a.openings.map(box).join('')+labels+'<path d="M20 755 H1170" stroke="#222"/><text x="45" y="785" font-size="16">F-001 | SCHEMATIC ELEVATION | NOT FOR CONSTRUCTION</text><text x="45" y="807" font-size="12">Dimensions in metres. Diagram is fit-to-sheet, NOT a fixed engineering scale.</text><text x="780" y="785" font-size="14">Net area: '+round(a.net)+' m2 | Order: '+round(a.order)+' m2</text></svg>';
}
function safeName(s){return s.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,70)||'facade';}
function run(inputPath,outputDir) {
  const a=analyze(JSON.parse(fs.readFileSync(inputPath,'utf8')));
  fs.mkdirSync(outputDir,{recursive:true});
  const name=safeName(a.project);
  for(const [ext,data] of [['dxf',dxf(a)],['svg',svg(a)],['csv',csv(a)],['json',JSON.stringify({...a,gross:round(a.gross),deductions:round(a.deductions),net:round(a.net),order:round(a.order),status:'SCHEMATIC_NOT_FOR_CONSTRUCTION'},null,2)]]) fs.writeFileSync(path.join(outputDir,name+'.'+ext),data,'utf8');
  return a;
}
if(require.main===module){try{if(process.argv.length!==4) throw Error('Usage: node facade-pilot.cjs input.json output-dir'); const a=run(process.argv[2],process.argv[3]);console.log('Generated schematic DXF, SVG, CSV and JSON for '+a.project+'; net '+round(a.net)+' m2');}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={analyze,csv,dxf,svg,run};
