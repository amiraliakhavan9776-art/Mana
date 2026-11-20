'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{takeoffFromPersian:run}=require('../floor-takeoff-fa.cjs');
test('Persian named clauses calculate exact net via the native core',()=>{
 const r=run('مساحت خالص کف مستطیل، طول ۵ متر، عرض ۴ متر، مساحت کسرشده ۳ مترمربع');
 assert.equal(r.net_area_m2,'17');assert.equal(r.modelCalls,0);
 assert.equal(run('طول ۳٫۲ متر و عرض ۴٫۷ متر و مساحت کسر شده ۰٫۰۴ متر مربع').net_area_m2,'15');
 assert.equal(run('طول ٣٫٢ متر، عرض ٤٫٧ متر، بدون کسر').net_area_m2,'15.04');
});
test('missing field, missing unit, mixed unit and duplicate prompt rather than guessing',()=>{
 for(const [s,f] of [['طول ۵ متر، عرض ۴ متر','excluded_area_m2'],['طول ۵، عرض ۴ متر، بدون کسر','length_m'],['طول ۵ متر، عرض ۴ متر، مساحت کسرشده ۳ متر','excluded_area_m2'],['طول ۵ متر، طول ۶ متر، عرض ۴ متر، بدون کسر','length_m'],['طول ۵ سانتی متر، عرض ۴ متر، بدون کسر','length_m']]){
  const r=run(s);assert.equal(r.status,'NEEDS_INPUT',JSON.stringify(r));assert.ok(r.fields.includes(f));assert.equal(r.net_area_m2,undefined);
 }
});
test('unsupported free text, extra qualifiers and ambiguous decimals do not execute',()=>{
 for(const s of ['مساحت اتاق ۵ در ۴ را حساب کن','طول 5 متر و عرض 4 متر و مساحت کسرشده 3 مترمربع همراه هزینه','طول ۵/۲ متر، عرض ۴ متر، بدون کسر','طول 5e2 متر، عرض 4 متر، بدون کسر','طول ۵-۶ متر، عرض ۴ متر، بدون کسر','مساحت کف را به عدد ۷ حساب کن']){
  assert.notEqual(run(s).status,'FLOOR_TAKEOFF_CALCULATED',s);
 }
});
test('bounds and over-exclusion are explicit; all conditions never launch a model',()=>{
 const a=run('طول ۱۰۱ متر، عرض ۴ متر، بدون کسر');assert.equal(a.status,'INVALID_INPUT');assert.equal(a.modelCalls,0);
 const b=run('طول ۲ متر، عرض ۳ متر، سطح کسرشده ۷ مترمربع');assert.equal(b.net_area_m2,'0');assert.equal(b.clamped,true);
});
