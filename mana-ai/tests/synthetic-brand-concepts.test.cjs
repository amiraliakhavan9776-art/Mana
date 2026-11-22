'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createSyntheticBrandStudio,fixtureBrief}=require('../src/native/synthetic-brand-concepts.cjs');
const studio=createSyntheticBrandStudio();
const build=(revision='R1',brief=fixtureBrief)=>studio.propose({brief,revision});
const denied=(result,reasonCode)=>{
 assert.equal(result.reasonCode,reasonCode);
 assert.equal(result.publicationAllowed,false);
 assert.equal(result.approved,false);
 assert.equal(result.externalActions,0);
 assert.equal(result.modelCalls,0);
 for(const key of ['markdown','options','proposalSha256'])assert.equal(Object.hasOwn(result,key),false);
};
test('real offline synthetic DXF-backed proposal is deterministic and two alternatives are distinct',()=>{
 const p=build();
 assert.equal(p.status,'SYNTHETIC_HUMAN_REVIEW_ONLY');
 assert.deepEqual(p,build('R1',{...fixtureBrief,channels:[...fixtureBrief.channels].reverse()}));
 assert.equal(p.source.facadeSha256,'2ea9e764f5747dea78c04b0eab27f0b4da789aa0ab78b8dd9b08afe85986994b');
 assert.equal(p.source.openingM2,'6');
 assert.equal(p.source.representation,'MEASURED_SYNTHETIC_DXF_2D');
 assert.equal(p.source.materialEvidence,'NOT_PROVIDED_BY_VERIFIED_SOURCE');
 assert.equal(p.source.photorealisticEvidence,'NOT_PROVIDED_BY_VERIFIED_SOURCE');
 assert.equal(p.researchPerformed,false);
 assert.equal(p.options.length,2);
 assert.notEqual(p.options[0].layout,p.options[1].layout);
 assert.notDeepEqual(p.options[0].palette,p.options[1].palette);
 assert.notEqual(p.options[0].storyboard[0].direction,p.options[1].storyboard[0].direction);
 for(const o of p.options){
  assert.equal(o.storyboard.length,3);
  assert.equal(o.storyboard[1].sourceEvidence.entitySha256,p.source.openingEntitySha256);
 }
 const r=studio.render({proposal:p,revision:'R1'});
 assert.equal(r.status,'CURRENT_HUMAN_REVIEW_ONLY');
 assert.match(r.markdown,/هیچ مصالح/);
 assert.match(r.markdown,/استوری‌بورد/);
 assert.match(r.markdown,/سکوتِ منظم/);
 assert.match(r.markdown,/توالیِ گرم/);
 assert.match(r.markdown,new RegExp(p.proposalSha256));
});
test('same revision does not force same creative output: structured goal, audience and channel matter',()=>{
 const prior=build();
 const p=build('R1',{...fixtureBrief,profile:'measured-clarity',audience:'design-reviewers',channels:['presentation']});
 assert.deepEqual(p.source,prior.source);
 assert.notEqual(p.proposalSha256,prior.proposalSha256);
 assert.deepEqual(p.options.map(o=>o.id),['calm-grid','diagram-first']);
 assert.ok(p.options.every(o=>o.toneFa.includes('گروه')||o.toneFa.includes('نسخه')));
 assert.ok(p.options.every(o=>o.channelNotes.length===1&&o.channelNotes[0].id==='presentation'));
});
test('legitimate R1 draft is stale for R2 and cannot be rendered; generated R2 cites measured change',()=>{
 const prior=build();
 const checked=studio.check({proposal:prior,revision:'R2'});
 assert.equal(checked.status,'STALE_NO_BRAND_ARTIFACT');
 denied(checked,'ARCHITECTURE_SOURCE_CHANGED');
 denied(studio.render({proposal:prior,revision:'R2'}),'ARCHITECTURE_SOURCE_CHANGED');
 assert.equal(studio.check({proposal:prior,revision:'R1'}).status,'CURRENT_HUMAN_REVIEW_ONLY');
 const newDraft=build('R2');
 assert.equal(newDraft.source.openingM2,'7.5');
 assert.equal(newDraft.source.floorSha256,prior.source.floorSha256);
 for(const k of ['facadeSha256','openingEntitySha256','dxfReportSha256'])assert.notEqual(prior.source[k],newDraft.source[k]);
 assert.notEqual(prior.proposalSha256,newDraft.proposalSha256);
 assert.match(studio.render({proposal:newDraft,revision:'R2'}).markdown,/7\.5 مترمربع/);
});
test('missing brief yields no output draft and unknown data cannot assert material, scope, or rendered reality',()=>{
 for(const brief of [undefined,null])denied(build('R1',brief===undefined?null:brief),'BRIEF_REQUIRED');
 denied(studio.propose({revision:'R1'}),'BRIEF_REQUIRED');
 for(const extra of [{materials:['سنگ']},{photorealistic:true},{sourceSha256:'a'.repeat(64)},
  {projectId:'customer-project'},{focus:'north-opening'},{profile:'generic'},{audience:'unknown'},
  {channels:['presentation','presentation']},{channels:['public-launch']},{channels:Array(1)}]){
  denied(build('R1',{...fixtureBrief,...extra}),'BRIEF_DATA_UNSUPPORTED');
 }
 denied(build('R3'),'SOURCE_REVISION_UNSUPPORTED');
 let invoked=0;
 const bad={...fixtureBrief,get audience(){invoked++;return 'design-reviewers';}};
 denied(build('R1',bad),'BRIEF_DATA_UNSUPPORTED');
 assert.equal(invoked,0);
});
test('tampered draft or digest cannot render, nor be passed off as only a stale revision',()=>{
 const p=build();
 for(const tamper of [
  {...p,publicationAllowed:true},
  {...p,source:{...p.source,materialEvidence:'TRAVERTINE'}},
  {...p,options:[{...p.options[0],layout:'<script>external()</script>'},p.options[1]]},
  {...p,proposalSha256:'0'.repeat(64)},
  {...p,source:{...p.source,facadeRevision:'R2'}},
 ]){
  denied(studio.render({proposal:tamper,revision:'R1'}),'PROPOSAL_UNVERIFIED');
  denied(studio.render({proposal:tamper,revision:'R2'}),'PROPOSAL_UNVERIFIED');
 }
 const copy=JSON.parse(JSON.stringify(p));
 assert.equal(studio.render({proposal:copy,revision:'R1'}).status,'CURRENT_HUMAN_REVIEW_ONLY');
});
test('existing proposal cannot render when source fixture becomes unavailable or changed',t=>{
 const p=build(),read=fs.readSync;
 t.mock.method(fs,'readSync',(fd,buffer,offset,length,position)=>{
  const n=read(fd,buffer,offset,length,position);
  if(n>0)buffer[offset]^=1;
  return n;
 });
 denied(studio.render({proposal:p,revision:'R1'}),'ARCHITECTURE_EVIDENCE_UNVERIFIED');
 denied(build(),'ARCHITECTURE_EVIDENCE_UNVERIFIED');
});
