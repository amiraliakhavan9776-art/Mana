'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {POLICY,checkSkillDimensions:check,validateDimensionContract}=require('../src/native/skill-dimension-check.cjs');
const field=name=>({field:name}),value=x=>({value:x}),op=(name,...args)=>({op:name,args});
const contract=(power,requiredFields=[],counterfactualPairs=[])=>({schema:POLICY,expectedPower:power,requiredFields,counterfactualPairs});
// Synthetic checker fixtures, not model-generated skill acceptance or solutions sent to a model.
const area=op('multiply',field('length_m'),field('width_m'));
const inputs={length_m:2,width_m:3};
const areaContract=contract(2,['length_m','width_m'],[{field:'length_m',before:inputs,after:{...inputs,length_m:4}},{field:'width_m',before:inputs,after:{...inputs,width_m:5}}]);
test('length powers and actual independent counterfactual changes both pass',()=>{
 const r=check(area,Object.keys(inputs),areaContract);assert.equal(r.ok,true);assert.equal(r.actualPower,2);assert.deepEqual(r.missingFields,[]);assert.equal(JSON.stringify(r).includes('before'),false);
});
test('type/power errors reject incompatible add, subtraction, comparisons, conditional branches',()=>{
 const fields=['length_m','excluded_area_m2'];
 for(const expression of [op('add',field('length_m'),field('excluded_area_m2')),op('subtract',field('length_m'),value(1)),op('min',field('length_m'),field('excluded_area_m2')),op('equal',field('length_m'),field('excluded_area_m2')),op('if',value(true),field('length_m'),field('excluded_area_m2'))])assert.equal(check(expression,fields,contract(1)).code,'DIMENSION_MISMATCH');
 for(const expression of [op('multiply',value(true),field('length_m')),op('if',field('length_m'),field('length_m'),field('length_m')),op('equal',value(true),field('length_m'))])assert.equal(check(expression,fields,contract(1)).code,'DIMENSION_TYPE_MISMATCH');
 assert.equal(check(field('length_m'),fields,contract(2)).code,'OUTPUT_DIMENSION_MISMATCH');
});
test('zero clamp and dimensionless ratios accepted; mm conversion is explicitly not proved',()=>{
 const net=op('max',value(0),op('subtract',area,field('excluded_area_m2')));assert.equal(check(net,['length_m','width_m','excluded_area_m2'],contract(2)).ok,true);
 assert.equal(check(op('divide',field('length_m'),field('width_m')),['length_m','width_m'],contract(0)).ok,true);
 const unconverted=op('multiply',area,field('thickness_mm'));
 assert.equal(check(unconverted,['length_m','width_m','thickness_mm'],contract(3)).ok,true);
 assert.equal(check(op('divide',unconverted,value(1000)),['length_m','width_m','thickness_mm'],contract(3)).ok,true);
 assert.equal(check(value(0),[],contract(2)).code,'OUTPUT_DIMENSION_MISMATCH');
});
test('syntactic references, zero multiplication and cancellation do not establish effective dependency',()=>{
 const fields=['length_m','width_m','excluded_area_m2'],base={...inputs,excluded_area_m2:1};
 const c=contract(2,fields,fields.map(f=>({field:f,before:base,after:{...base,[f]:base[f]+1}})));
 for(const neutral of [op('multiply',field('excluded_area_m2'),value(0)),op('subtract',field('excluded_area_m2'),field('excluded_area_m2'))]){
 const r=check(op('add',area,neutral),fields,c);assert.equal(r.code,'REQUIRED_FIELD_NOT_EFFECTIVE');assert.deepEqual(r.missingFields,['excluded_area_m2']);
 }
});
test('trusted probes are checked: exactly one field changes and each requirement has evidence',()=>{
 for(const c of [{...areaContract,extra:1},{...areaContract,expectedPower:1.5},{...areaContract,schema:'other'},{...areaContract,counterfactualPairs:[]},{...areaContract,requiredFields:['length_m','length_m']},{...areaContract,counterfactualPairs:[{field:'length_m',before:inputs,after:{length_m:4,width_m:4}}]},{...areaContract,counterfactualPairs:[{field:'length_m',before:inputs,after:inputs}]},{...areaContract,counterfactualPairs:[{field:'length_m',before:inputs,after:{...inputs,length_m:Infinity}}]}]){assert.equal(validateDimensionContract(Object.keys(inputs),c),false);assert.equal(check(area,Object.keys(inputs),c).code,'INVALID_DIMENSION_CONTRACT');}
});
test('evaluation failure and unsupported field dimensions fail closed',()=>{
 const fields=['length_m'],c=contract(0,fields,[{field:'length_m',before:{length_m:1},after:{length_m:0}}]);assert.equal(check(op('divide',field('length_m'),field('length_m')),fields,c).code,'DEPENDENCE_EVALUATION_FAILED');
 assert.equal(check(field('height'),['height'],contract(1)).code,'UNKNOWN_FIELD_DIMENSION');assert.equal(check({op:'eval',args:[]},[],contract(0)).code,'INVALID_EXPRESSION');
 let x=field('length_m');for(let i=0;i<4;i++)x=op('multiply',x,x);assert.equal(check(x,fields,contract(1)).code,'DIMENSION_POWER_LIMIT');
});
test('conditional masking and below-tolerance effects do not falsely pass',()=>{
 const masked=op('if',value(true),field('length_m'),field('width_m'));
 const c={...areaContract,expectedPower:1};assert.deepEqual(check(masked,Object.keys(inputs),c).missingFields,['width_m']);
 const tiny=op('multiply',field('length_m'),value(1e-12));const r=check(tiny,['length_m'],contract(1,['length_m'],[{field:'length_m',before:{length_m:1},after:{length_m:2}}]));assert.equal(r.code,'REQUIRED_FIELD_NOT_EFFECTIVE');
});
test('boolean conditions can compare same units while both result branches remain typed',()=>{
 const expr=op('if',op('less',field('length_m'),field('width_m')),field('length_m'),field('width_m'));assert.equal(check(expr,Object.keys(inputs),contract(1)).ok,true);
 assert.equal(check(op('equal',value(true),value(false)),[],contract(0)).code,'DIMENSION_TYPE_MISMATCH');
});
