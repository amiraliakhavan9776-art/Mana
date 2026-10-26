'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createTrainingFeedbackExporter}=require('../src/native/training-feedback.cjs');
const {payloadDigest}=require('../src/approval-store.cjs');
const project={id:'p',orgId:'org'},principal={id:'exporter',orgId:'org',role:'analyst',projectIds:['p'],capabilityIds:['native.training.export']};
const record={id:'feedback-1',group:'remaining-items',organizationId:'org',projectId:'p',requesterId:'requester',reviewerId:'reviewer',request:'Return remaining item count',code:'def remaining(a,b):\n    return max(0,a-b)\n',consentId:'consent-1',reviewId:'review-1',privacyReviewId:'privacy-1',rightsRef:'owner-approved-source'};
test('only exact host-reviewed feedback becomes a compatible dataset row with provenance',()=>{
 const verified=new Set([payloadDigest(record)]);const exporter=createTrainingFeedbackExporter({authorize:()=>true,verifyReview:({digest})=>verified.has(digest)});const output=exporter.export({principal,project,records:[record]}),row=JSON.parse(output.jsonl);assert.equal(output.trained,false);assert.equal(row.training_allowed,true);assert.equal(row.code,record.code);assert.match(row.source,/reviewed-feedback:/);assert.equal(output.provenance[0].digest,payloadDigest(record));assert.equal(output.productionDeploymentAllowed,false);
 assert.throws(()=>exporter.export({principal,project,records:[{...record,code:'changed'}]}),/not verified/);
 verified.clear();assert.throws(()=>exporter.export({principal,project,records:[record]}),/not verified/);
});
test('scope, export capability, self-review, unknown approval fields and answer leakage are denied',()=>{
 const exporter=createTrainingFeedbackExporter({authorize:()=>true,verifyReview:()=>true});const run=(records,who=principal)=>exporter.export({principal:who,project,records});
 for(const bad of [{...record,projectId:'foreign'},{...record,reviewerId:record.requesterId},{...record,approved:true},{...record,consentId:''}])assert.throws(()=>run([bad]));
 assert.throws(()=>run([record],{...principal,capabilityIds:[]}));assert.throws(()=>run([record],{...principal,projectIds:[]}));assert.throws(()=>run([record,{...record,id:'second',group:'another-family'}]),/Cross-group/);
});
