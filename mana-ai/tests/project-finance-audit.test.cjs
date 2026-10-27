'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {auditLedger}=require('../src/native/project-finance-audit.cjs');
const input={projectId:'project_alpha',contract:{basis:'costs',feeNumerator:12,feePercentDenominator:100},costs:[{id:'c1',sourceRef:'invoice-001',amountIRR:'100000000000000000',status:'verified'},{id:'c2',sourceRef:'invoice-002',amountIRR:'10000000000000000',status:'verified'}],payments:[{id:'p1',sourceRef:'receipt-001',amountIRR:'30000000000000000',status:'verified'}]};
test('finance audit performs large exact-integer reconciliation and explicit 12pct management fee',()=>{
 const x=auditLedger(input).report;
 assert.equal(x.verifiedCostsIRR,'110000000000000000');
 assert.equal(x.managementFeeIRR,'13200000000000000');
 assert.equal(x.balanceIRR,'93200000000000000');
 assert.equal(x.currency,'IRR');
});
test('finance audit rejects ambiguous currency, unsigned amounts, accidental floats and percent basis',()=>{
 for(const diff of [{costs:[{...input.costs[0],amountIRR:'12.4'}]},{costs:[{...input.costs[0],amountIRR:'-5'}]},{contract:{...input.contract,feePercentDenominator:1000}},{currency:'TOMAN'}])assert.throws(()=>auditLedger({...input,...diff}));
});
test('finance audit flags duplicates and refuses to count unverified without reporting',()=>{
 const r=auditLedger({...input,costs:[...input.costs,{...input.costs[0],sourceRef:'invoice-001-copy',status:'unverified'}]}).report;
 assert.equal(r.duplicates.length,1);assert.equal(r.excludedUnverified.costs,1);assert.equal(r.holdsForReview,true);
});
test('finance audit distinguishes overpayment with a signed balance',()=>{
 const r=auditLedger({...input,payments:[{...input.payments[0],amountIRR:'999999999999999999'}]}).report;
 assert.equal(r.balanceMeaning,'OVERPAYMENT_VS_VERIFIED_LEDGER');assert.match(r.balanceIRR,/^-/);
});
