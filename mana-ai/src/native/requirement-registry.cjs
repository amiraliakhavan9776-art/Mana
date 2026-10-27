'use strict';
/** MANA requirement registry. Explicit, review-only traceability: no LLM-inferred completion. */
const crypto = require('node:crypto');
const PHASES = Object.freeze(['core', 'aec', 'business', 'jarvis', 'creative', 'platform']);
const STATUSES = Object.freeze(['required', 'designed', 'coded_unverified', 'prototype_tested', 'integrated_tested', 'accepted']);
const CAT = Object.freeze([
 ['CORE-01','Native reasoning, adaptive planning, evidence and metacognition','core'],
 ['CORE-02','Durable mission DAG, execution, recovery and approvals','core'],
 ['CORE-03','Private scoped memory and evidence ledger','core'],
 ['CORE-04','Council, critique, scenario and risk analysis','core'],
 ['CORE-05','AI Coder, isolated testing, repair and controlled evolution','core'],
 ['CORE-06','Universal profession builder and model/provider routing','core'],
 ['AEC-01','Phase 0 site, climate, sun, wind and regulatory study','aec'],
 ['AEC-02','Spatial program, geometry and alternate floor plans','aec'],
 ['AEC-03','Phase 1 and phase 2 engineering drawings and details','aec'],
 ['AEC-04','Editable DXF/DWG/IFC/BIM and 3D model interfaces','aec'],
 ['AEC-05','Render, interior, exterior, animation and revision','aec'],
 ['AEC-06','Design change impact propagation and version history','aec'],
 ['AEC-07','Quantity takeoff with units and geometry provenance','aec'],
 ['AEC-08','Deterministic estimate, price references and cost engineering','aec'],
 ['AEC-09','Progress claims, site evidence, deductions, approvals and contracts','aec'],
 ['AEC-10','Project controls, WBS, finance, risk and technical office','aec'],
 ['AEC-11','Architecture booklet with verified editable sources','aec'],
 ['BIZ-01','Cross-department Company OS and digital twin','business'],
 ['BIZ-02','Industry-neutral Strategy Architect and KPI monitoring','business'],
 ['BIZ-03','Reality Check, Risk Sentinel and Contract Intelligence','business'],
 ['BIZ-04','Partner, Meeting, Academy, Audit and Regulatory Intelligence','business'],
 ['JAR-01','Private Jarvis memory, agent missions, voice and multimodal UI','jarvis'],
 ['JAR-02','Personal scheduling, research, communications and proactive tasks','jarvis'],
 ['JAR-03','Wealth Architect and personal decision council','jarvis'],
 ['CRE-01','Image generation and editing studio','creative'],
 ['CRE-02','Video generation, editing and storyboard studio','creative'],
 ['CRE-03','Music, audio and voice studio with consent','creative'],
 ['CRE-04','Brand OS including visual, acoustic and scent identity','creative'],
 ['CRE-05','Web, WordPress, SEO and content studio','creative'],
 ['CRE-06','Scent Lab and physical product formulation review','creative'],
 ['PLAT-01','Integration Studio, tools, API and computer-use boundaries','platform'],
 ['PLAT-02','Encrypted cloud workspace, search, backup and recovery','platform'],
 ['PLAT-03','Access control, audit, sandbox and professional approvals','platform'],
 ['PLAT-04','RTL web, desktop, mobile and internationalized UI','platform']
]);
function catalog(){return CAT.map(([id,title,phase])=>({id,title,phase,status:'required',evidence:[]}));}
function validate(items){
 if(!Array.isArray(items)||items.length!==CAT.length)throw Error('Complete requirement catalog required');
 const byId=new Map(CAT.map(x=>[x[0],x]));const seen=new Set();
 for(const item of items){
  if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['id','title','phase','status','evidence'].includes(k)))throw Error('Invalid requirement entry');
  const known=byId.get(item.id);
  if(!known||seen.has(item.id)||item.title!==known[1]||item.phase!==known[2]||!STATUSES.includes(item.status))throw Error('Unknown, changed or duplicate requirement');
  if(!Array.isArray(item.evidence)||item.evidence.length>25||item.evidence.some(s=>typeof s!=='string'||s.length<8||s.length>500))throw Error('Invalid evidence reference');
  if(item.status!=='required'&&item.status!=='designed'&&item.evidence.length===0)throw Error('Evidence required for claimed implementation');
  seen.add(item.id);
 }
 return true;
}
function backlog(items){
 validate(items);
 const sorted=items.filter(x=>x.status!=='accepted').sort((a,b)=>PHASES.indexOf(a.phase)-PHASES.indexOf(b.phase)||a.id.localeCompare(b.id));
 const body={schema:'MANA_REQUIREMENT_BACKLOG_V1',total:items.length,accepted:items.filter(x=>x.status==='accepted').length,remaining:sorted.map(({id,title,phase,status})=>({id,title,phase,status}))};
 return {...body,sha256:crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')};
}
module.exports={catalog,validate,backlog,STATUSES};
