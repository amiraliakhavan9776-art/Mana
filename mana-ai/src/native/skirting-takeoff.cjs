'use strict';
// Exact linear takeoff from user-entered internal dimensions. No geometry
// inference, pricing, supply allowance, certification, persistence or model.
const {decimal,add,sub,mul,cmp,format}=require('../financial/exact-decimal.cjs');
const SCHEMA='MANA_RECTANGULAR_SKIRTING_TAKEOFF_V1';
const INPUT=['length_m','width_m','excluded_length_m'];
const ZERO=decimal('0'),TWO=decimal('2'),MAX_DIMENSION=decimal('100'),MAX_DEDUCTION=decimal('400');
const fail=code=>{const error=Error(code);error.code=code;throw error;};
function read(input,key){
 const d=Object.getOwnPropertyDescriptor(input,key);
 if(!d||!Object.hasOwn(d,'value')||!d.enumerable)fail('INVALID_INPUT');
 if(typeof d.value!=='string'||!/^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,3})?$/u.test(d.value)||/[\r\n]/u.test(d.value))fail('INVALID_DECIMAL');
 return decimal(d.value);
}
function compact(value){const s=format(value);return s.includes('.')?s.replace(/0+$/u,'').replace(/\.$/u,''):s;}
function calculateSkirtingTakeoff(input){
 if(!input||typeof input!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(input))||Reflect.ownKeys(input).length!==INPUT.length)fail('INVALID_INPUT');
 const [length,width,deduction]=INPUT.map(key=>read(input,key));
 if([length,width].some(x=>cmp(x,ZERO)<=0||cmp(x,MAX_DIMENSION)>0))fail('DIMENSION_OUT_OF_RANGE');
 const gross=mul(add(length,width),TWO);
 if(cmp(deduction,MAX_DEDUCTION)>0||cmp(deduction,gross)>0)fail('DEDUCTION_EXCEEDS_PERIMETER');
 return Object.freeze({schema:SCHEMA,geometry:Object.freeze({type:'user_entered_internal_rectangle',length_m:compact(length),width_m:compact(width)}),unit:'m',formula:'2 × (length + width) − total no-skirting width',gross_perimeter_m:compact(gross),excluded_length_m:compact(deduction),net_skirting_m:compact(sub(gross,deduction)),modelCalls:0});
}
module.exports={calculateSkirtingTakeoff};
