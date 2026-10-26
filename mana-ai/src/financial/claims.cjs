'use strict';
// Exact bounded arithmetic. No legal rates, approvals, payments or database writes.
const {payloadDigest}=require('../approval-store.cjs');
const {decimal,zero,add,sub,mul,cmp,round,format}=require('./exact-decimal.cjs');
const MODES=new Set(['unit_price','lump_sum','area','labor','progress','mixed']);
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
function fields(x,allowed){if(!x||Object.getPrototypeOf(x)!==Object.prototype||Object.keys(x).some(k=>!allowed.includes(k)))throw Error('Unexpected claim fields');}
function id(x){if(typeof x!=='string'||!ID.test(x))throw Error('Claim identifier required');return x;}
function label(x,max=100){if(typeof x!=='string'||!x.trim()||x.length>max||/[\r\n\x00-\x1f]/.test(x))throw Error('Claim reference/label required');return x;}
const percent=(a,b)=>({n:a.n*b.n,s:a.s+b.s+2});
function policy(x){fields(x,['scale','mode','lineRounding']);if(!Number.isInteger(x.scale)||x.scale<0||x.scale>6||!['half_up','half_even','toward_zero'].includes(x.mode)||!['per_line','invoice'].includes(x.lineRounding))throw Error('Explicit rounding policy required');return x;}
function rate(x){const d=decimal(x);if(cmp(d,decimal('100'))>0)throw Error('Rate exceeds 100 percent');return d;}
function unique(rows,max){if(!Array.isArray(rows)||rows.length>max)throw Error('Bounded claim rows required');const ids=new Set();for(const r of rows){id(r?.id);if(ids.has(r.id))throw Error('Duplicate claim row');ids.add(r.id);}return rows;}
function calculateClaim(input,scope){
 const inputDigest=payloadDigest(input);input=JSON.parse(JSON.stringify(input));
 fields(input,['schemaVersion','id','organizationId','projectId','currency','mode','rounding','policyRef','lines','deductions','tax','paidToDate']);
 if(input.schemaVersion!==1||!scope||input.organizationId!==scope.organizationId||input.projectId!==scope.projectId)throw Error('Claim scope/schema denied');
 id(input.id);id(input.organizationId);id(input.projectId);label(input.policyRef);
 if(!['IRR','IRT'].includes(input.currency)||!MODES.has(input.mode))throw Error('Unsupported claim currency/mode');
 const rounding=policy(input.rounding),money=d=>round(d,rounding),text=d=>format(money(d));
 const lines=unique(input.lines,10);if(!lines.length)throw Error('Claim lines required');
 let rawGross=zero();
 const calculated=lines.map(line=>{
  const mode=input.mode==='mixed'?line.mode:input.mode;
  if(!MODES.has(mode)||mode==='mixed'||(input.mode!=='mixed'&&line.mode!==undefined&&line.mode!==mode))throw Error('Invalid claim line mode');
  const base=['id','mode','sourceRef','description'];label(line.sourceRef);label(line.description,160);let raw;
  if(['unit_price','area','labor'].includes(mode)){
   fields(line,[...base,'quantity','unitPrice','unit']);label(line.unit,20);
   if(mode==='area'&&line.unit!=='m2')throw Error('Area unit must be m2');
   if(mode==='labor'&&!['hour','day'].includes(line.unit))throw Error('Labor unit must be hour or day');
   raw=mul(decimal(line.quantity),decimal(line.unitPrice));
  }else if(mode==='lump_sum'){fields(line,[...base,'amount']);raw=decimal(line.amount);}
  else{fields(line,[...base,'baseAmount','periodPercent']);raw=percent(decimal(line.baseAmount),rate(line.periodPercent));}
  rawGross=add(rawGross,rounding.lineRounding==='per_line'?money(raw):raw);
  return {id:line.id,mode,sourceRef:line.sourceRef,description:line.description,exactAmount:format(raw),displayAmount:text(raw)};
 });
 const gross=money(rawGross);let deductionTotal=zero();
 const deductions=unique(input.deductions,8).map(row=>{
  label(row.sourceRef);let raw;
  if(row.kind==='fixed'){fields(row,['id','kind','amount','sourceRef']);raw=decimal(row.amount);}
  else if(row.kind==='percent'){fields(row,['id','kind','rate','base','sourceRef']);if(row.base!=='gross')throw Error('Deduction base must be explicit gross');raw=percent(gross,rate(row.rate));}
  else throw Error('Unsupported deduction kind');
  const amount=money(raw);deductionTotal=add(deductionTotal,amount);return {id:row.id,kind:row.kind,sourceRef:row.sourceRef,amount:format(amount)};
 });
 if(cmp(deductionTotal,gross)>0)throw Error('Deductions exceed gross; separate reviewed correction workflow required');
 fields(input.tax,['rate','base','sourceRef']);label(input.tax.sourceRef);
 if(!['gross','after_deductions'].includes(input.tax.base))throw Error('Explicit tax base required');
 const taxable=input.tax.base==='gross'?gross:sub(gross,deductionTotal),tax=money(percent(taxable,rate(input.tax.rate))),net=add(sub(gross,deductionTotal),tax),paid=money(decimal(input.paidToDate)),balance=sub(net,paid);
 const toIRR=d=>input.currency==='IRT'?mul(d,decimal('10')):d;
 const result={schema:'MANA_CLAIM_CALCULATION_V1',claimId:input.id,organizationId:input.organizationId,projectId:input.projectId,inputDigest,policyRef:input.policyRef,currency:input.currency,mode:input.mode,rounding,lines:calculated,deductions,
  tax:{rate:input.tax.rate,base:input.tax.base,sourceRef:input.tax.sourceRef,taxableAmount:format(taxable),amount:format(tax)},
  totals:{gross:format(gross),deductions:format(deductionTotal),tax:format(tax),net:format(net),paidToDate:format(paid),balance:format(balance)},
  normalizedIRR:{gross:format(toIRR(gross)),net:format(toIRR(net)),balance:format(toIRR(balance))},
  status:'draft_calculation',overpaid:balance.n<0n,limitations:['Period quantities/percentages only; no cumulative prior-certificate reconciliation.','Rates, quantities, sources and rounding are supplied policy, not independently certified legal or engineering facts.','No approval, payment, accounting posting or live migration.']};
 payloadDigest(result);return result;
}
module.exports={calculateClaim};
