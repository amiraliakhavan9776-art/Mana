'use strict';
/**
 * MANA_NATIVE_SKILL_V1: deterministic, model-free compiler for a narrow family
 * of Decimal-based business calculation skills. Pure code generation only.
 * No subprocesses, eval, code execution, network or source modifications.
 */
const crypto = require('node:crypto');
const NAME = /^[a-z][a-z0-9_]{0,47}$/;
const OPS = new Set(['add','subtract','multiply','divide','min','max','gt','gte','lt','lte','eq']);
const MAX_NODES = 128;
function plain(o) { return o !== null && typeof o === 'object' && !Array.isArray(o) && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null); }
function keys(o, names) { return Object.keys(o).sort().join('|') === names.slice().sort().join('|'); }
function fail(msg){throw new TypeError('MANA_NATIVE_SKILL_INVALID: '+msg);}
function validDecimal(v) { return typeof v === 'string' && /^-?(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,12})?$/.test(v); }
function validate(spec) {
 if(!plain(spec)||!keys(spec,['schema','name','fields','expression','tests'])||spec.schema!=='MANA_NATIVE_SKILL_V1'||typeof spec.name!=='string'||!NAME.test(spec.name))fail('schema/name');
 if(!Array.isArray(spec.fields)||spec.fields.length<1||spec.fields.length>16||spec.fields.some(f=>typeof f!=='string'||!NAME.test(f))||new Set(spec.fields).size!==spec.fields.length)fail('fields');
 const fields=new Set(spec.fields);let nodes=0;
 const walk=(node,depth)=>{
  if(++nodes>MAX_NODES||depth>14||!plain(node))fail('complexity');
  if(keys(node,['field'])){if(!fields.has(node.field))fail('unknown field');return 'numeric';}
  if(keys(node,['const'])){if(!validDecimal(node.const))fail('invalid decimal literal');return 'numeric';}
  if(keys(node,['op','args'])){
   if(!OPS.has(node.op)||!Array.isArray(node.args)||node.args.length!==2)fail('unsupported op');
   if(walk(node.args[0],depth+1)!=='numeric'||walk(node.args[1],depth+1)!=='numeric')fail('op types');
   return ['gt','gte','lt','lte','eq'].includes(node.op)?'boolean':'numeric';
  }
  if(keys(node,['if','then','else'])){
   if(walk(node.if,depth+1)!=='boolean')fail('conditional must be boolean');
   const a=walk(node.then,depth+1),b=walk(node.else,depth+1);if(a!=='numeric'||b!=='numeric')fail('branch types');return 'numeric';
  }
  fail('unsupported expression');
 };
 if(walk(spec.expression,0)!=='numeric')fail('numeric result required');
 if(!Array.isArray(spec.tests)||spec.tests.length<3||spec.tests.length>100)fail('independent acceptance vectors required');
 for(const t of spec.tests){
  if(!plain(t)||!keys(t,['input','expected'])||!plain(t.input)||!keys(t.input,spec.fields)||!validDecimal(t.expected))fail('test');
  for(const v of Object.values(t.input))if(!validDecimal(v))fail('test numeric input');
 }
 return true;
}
function expr(node) {
 if('field' in node)return `v[${JSON.stringify(node.field)}]`;
 if('const' in node)return `Decimal(${JSON.stringify(node.const)})`;
 if('if' in node)return `(${expr(node.then)} if ${expr(node.if)} else ${expr(node.else)})`;
 const a=expr(node.args[0]),b=expr(node.args[1]);
 switch(node.op){
  case 'add':return `(${a} + ${b})`;
  case 'subtract':return `(${a} - ${b})`;
  case 'multiply':return `(${a} * ${b})`;
  case 'divide':return `safe_div(${a}, ${b})`;
  case 'min':return `min(${a}, ${b})`;
  case 'max':return `max(${a}, ${b})`;
  case 'gt':return `(${a} > ${b})`;
  case 'gte':return `(${a} >= ${b})`;
  case 'lt':return `(${a} < ${b})`;
  case 'lte':return `(${a} <= ${b})`;
  case 'eq':return `(${a} == ${b})`;
  default:throw Error('unreachable');
 }
}
function compile(spec){
 validate(spec);
 const fieldList=JSON.stringify(spec.fields);
 const source=`# MANA generated native calculation skill. SOURCE IS UNTRUSTED UNTIL SANDBOX VERIFIED.\nfrom decimal import Decimal, localcontext, InvalidOperation\nimport re\n\nFIELDS = ${fieldList}\n\ndef safe_div(a, b):\n    if b == 0:\n        raise ValueError('division by zero')\n    return a / b\n\ndef run(data):\n    if not isinstance(data, dict) or set(data) != set(FIELDS):\n        raise ValueError('invalid field set')\n    v = {}\n    for field in FIELDS:\n        x = data[field]\n        if not isinstance(x, str) or not re.fullmatch(r'-?(?:0|[1-9][0-9]{0,17})(?:\\.[0-9]{1,12})?', x):\n            raise ValueError('decimal strings required')\n        try:\n            v[field] = Decimal(x)\n        except InvalidOperation:\n            raise ValueError('invalid decimal')\n        if not v[field].is_finite():\n            raise ValueError('nonfinite decimal')\n    with localcontext() as ctx:\n        ctx.prec = 36\n        result = ${expr(spec.expression)}\n        if not result.is_finite():\n            raise ValueError('nonfinite result')\n        return format(result, 'f')\n`;
 const vectorSource=`# Owner-supplied acceptance vectors; run only inside the validated sandbox.\nimport json, pathlib, sys\nsys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))\nfrom skill import run\nVECTORS = ${JSON.stringify(spec.tests)}\nfor i, case in enumerate(VECTORS):\n    actual = run(case['input'])\n    from decimal import Decimal\n    if Decimal(actual) != Decimal(case['expected']):\n        raise AssertionError(f'vector {i}: {actual} != {case["expected"]}')\nprint('MANA_NATIVE_VECTORS_PASSED:', len(VECTORS))\n`;
 const digest=crypto.createHash('sha256').update(source).digest('hex');
 return Object.freeze({schema:'MANA_NATIVE_CODE_DRAFT_V1',name:spec.name,source,vectorSource,sourceSha256:digest,testsDeclared:spec.tests.length,testsExecuted:false,sandboxVerified:false,approved:false,productionDeploymentAllowed:false});
}
module.exports={compile,validate};
