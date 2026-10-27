'use strict';
/** MANA AEC schematic V1. Model-independent deterministic rectangular zoning,
 * editable ASCII DXF, traceable area takeoff and preliminary cost estimate.
 * NOT a legal/code-compliant architectural plan, not phase 2 or BIM.
 * No shell, network, third-party packages, or execution of user code.
 */
const crypto=require('node:crypto');
const ID=/^[a-z][a-z0-9_]{0,39}$/;
const fixed=n=>Number(n.toFixed(4));
function assertNumber(n,label,min,max){if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error(`Invalid ${label}`)}
function validateBrief(b){
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).sort().join('|')!=='currency|depthM|projectId|rooms|unitCost|widthM')throw Error('Invalid AEC brief');
 if(typeof b.projectId!=='string'||!ID.test(b.projectId))throw Error('Invalid project ID');
 assertNumber(b.widthM,'widthM',5,150);assertNumber(b.depthM,'depthM',5,150);
 if(b.currency!=='IRR'&&b.currency!=='TOMAN')throw Error('Currency unit required');
 if(!Array.isArray(b.rooms)||b.rooms.length<2||b.rooms.length>20)throw Error('2-20 rooms required');
 let area=0;const names=new Set();
 for(const r of b.rooms){if(!r||Object.keys(r).sort().join('|')!=='areaM2|id|label'||typeof r.id!=='string'||!ID.test(r.id)||names.has(r.id)||typeof r.label!=='string'||r.label.trim().length<2||r.label.length>80)throw Error('Invalid room');assertNumber(r.areaM2,'room areaM2',3,10000);names.add(r.id);area+=r.areaM2}
 if(area>b.widthM*b.depthM+1e-9)throw Error('Room area exceeds envelope');
 assertNumber(b.unitCost,'unitCost',0,1000000000000);
 if(!Number.isSafeInteger(b.unitCost))throw Error('Unit cost must be an integer in explicit currency');
 return true;
}
function zones(brief,order){
 // Vertical strips are area-exact in floating point; adjusted last rectangle closes the known sum.
 let x=0;const out=[];
 for(const room of order){const width=room.areaM2/brief.depthM;out.push({id:room.id,label:room.label,x0:fixed(x),y0:0,x1:fixed(x+width),y1:fixed(brief.depthM),netAreaM2:room.areaM2});x+=width}
 return out;
}
function dxf(plan,brief){
 const parts=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1009','0','ENDSEC','0','SECTION','2','TABLES','0','TABLE','2','LAYER','70','2'];
 for(const [name,color] of [['ENVELOPE',7],['ROOMS',3]])parts.push('0','LAYER','2',name,'70','0','62',String(color),'6','CONTINUOUS');
 parts.push('0','ENDTAB','0','ENDSEC','0','SECTION','2','ENTITIES');
 function line(layer,x1,y1,x2,y2){parts.push('0','LINE','8',layer,'10',String(x1),'20',String(y1),'30','0','11',String(x2),'21',String(y2),'31','0')}
 function rect(layer,x1,y1,x2,y2){line(layer,x1,y1,x2,y1);line(layer,x2,y1,x2,y2);line(layer,x2,y2,x1,y2);line(layer,x1,y2,x1,y1)}
 rect('ENVELOPE',0,0,brief.widthM,brief.depthM);
 for(const r of plan.zones)rect('ROOMS',r.x0,r.y0,r.x1,r.y1);
 parts.push('0','ENDSEC','0','EOF');return parts.join('\n')+'\n';
}
function runBrief(brief){
 validateBrief(brief);
 const area=brief.rooms.reduce((a,r)=>a+r.areaM2,0);
 const a=zones(brief,brief.rooms),b=zones(brief,[...brief.rooms].reverse());
 const variants=[a,b].map((z,i)=>({id:`alternative_${i+1}`,kind:'SCHEMATIC_ZONING_ONLY',zones:z,unallocatedAreaM2:fixed(brief.widthM*brief.depthM-area)}));
 const takeoff=brief.rooms.map(r=>({elementId:r.id,description:r.label,quantity:r.areaM2,unit:'m2',origin:'CLIENT_BRIEF',formula:'declared_room_area',verifiedFromGeometry:false}));
 const amount=BigInt(Math.round(area*10000))*BigInt(brief.unitCost);
 const costWhole=amount/10000n,costFraction=amount%10000n;
 const subtotal=costWhole.toString()+(costFraction===0n?'':'.'+costFraction.toString().padStart(4,'0').replace(/0+$/,''));
 const report={schema:'MANA_AEC_SCHEMATIC_V1',projectId:brief.projectId,units:'m',currency:brief.currency,modelIndependent:true,envelope:{widthM:brief.widthM,depthM:brief.depthM,areaM2:fixed(brief.widthM*brief.depthM)},netProgramAreaM2:fixed(area),alternatives:variants,takeoff,estimate:{basis:'DECLARED_ROOM_NET_AREA_ONLY',currency:brief.currency,unitCostPerM2:String(brief.unitCost),subtotal,excludes:['structure','walls','circulation','MEP','contingency','taxes','code_review']},limitations:['No doors, windows, shafts, structure or circulation','No setbacks, permitting, fire/egress or professional review','Not a phase 1/2 construction drawing','Room widths may be impractical; suitability not asserted']};
 const files=Object.fromEntries(variants.map(v=>[`${v.id}.dxf`,dxf(v,brief)]));
 const markdown=`# MANA Preliminary AEC Study: ${brief.projectId}\n\nSchematic zoning only; NOT construction-ready.\n\nEnvelope: ${brief.widthM}m × ${brief.depthM}m; gross envelope ${report.envelope.areaM2} m².\n\nNet programmed area: ${report.netProgramAreaM2} m².\n\nEstimate (declared net area × supplied unit cost): **${subtotal} ${brief.currency}**.\n\nAlternatives: ${variants.map(v=>v.id).join(', ')}. Check rooms, circulation, structure and compliance with licensed professionals.\n`;
 files['study.md']=markdown;files['takeoff.json']=JSON.stringify({takeoff,estimate:report.estimate},null,2)+'\n';files['report.json']=JSON.stringify(report,null,2)+'\n';
 const receipts=Object.fromEntries(Object.entries(files).map(([name,content])=>[name,crypto.createHash('sha256').update(content).digest('hex')]));
 return {report,files,receipts};
}
module.exports={validateBrief,runBrief};
