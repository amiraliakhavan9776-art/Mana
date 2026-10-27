'use strict';
/** Deterministic, model-independent audit of explicitly scoped project ledger.
 * All amounts are nonnegative integer rial strings, no inference of ownership or tax.
 * Synthetic/unverified facts remain explicitly marked by callers.
 */
const crypto=require('node:crypto');
const VALUE=/^(?:0|[1-9][0-9]{0,29})$/;
const IDENT=/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/;
function amount(v){if(typeof v!=='string'||!VALUE.test(v))throw Error('Amount must be nonnegative integer string IRR');return BigInt(v)}
function validate(data){
 if(!data||Array.isArray(data)||Object.keys(data).sort().join('|')!=='contract|costs|payments|projectId')throw Error('Invalid finance ledger');
 if(typeof data.projectId!=='string'||!IDENT.test(data.projectId))throw Error('Invalid project');
 if(!Array.isArray(data.costs)||data.costs.length>10000||!Array.isArray(data.payments)||data.payments.length>10000)throw Error('Invalid lists');
 if(!data.contract||Object.keys(data.contract).sort().join('|')!=='basis|feeNumerator|feePercentDenominator'||data.contract.basis!=='costs'||!Number.isSafeInteger(data.contract.feeNumerator)||data.contract.feeNumerator<0||data.contract.feeNumerator>100||data.contract.feePercentDenominator!==100)throw Error('Invalid management-fee terms');
 let count=0;
 for(const [kind,rows] of [['cost',data.costs],['payment',data.payments]])for(const r of rows){
  if(!r||Object.keys(r).sort().join('|')!=='amountIRR|id|sourceRef|status'||typeof r.id!=='string'||!IDENT.test(r.id)||typeof r.sourceRef!=='string'||r.sourceRef.length<4||r.sourceRef.length>300||!['verified','unverified'].includes(r.status))throw Error('Invalid '+kind+' evidence');
  amount(r.amountIRR);count++;
 }
 if(count>20000)throw Error('Too many rows');return true;
}
const sum=rows=>rows.reduce((a,r)=>a+amount(r.amountIRR),0n);
function auditLedger(data){
 validate(data);
 const all=[...data.costs.map(r=>({...r,kind:'cost'})),...data.payments.map(r=>({...r,kind:'payment'}))];
 const seen=new Map(),duplicates=[];
 for(const r of all){const key=r.kind+':'+r.id;if(seen.has(key))duplicates.push({kind:r.kind,id:r.id,sourceRefs:[seen.get(key),r.sourceRef]});else seen.set(key,r.sourceRef)}
 const unique=(rows,kind)=>rows.filter((row,i)=>rows.findIndex(r=>r.id===row.id)===i&&row.status==='verified');
 const costsVerified=unique(data.costs,'cost'),paymentsVerified=unique(data.payments,'payment');
 const costs=sum(costsVerified),payments=sum(paymentsVerified),feeNumerator=BigInt(data.contract.feeNumerator),fee=costs*feeNumerator/100n;
 const totalDue=costs+fee,net=totalDue-payments;
 const report={schema:'MANA_PROJECT_FINANCE_AUDIT_V1',projectId:data.projectId,currency:'IRR',verifiedCostsIRR:costs.toString(),verifiedPaymentsIRR:payments.toString(),managementFeeIRR:fee.toString(),managementFeeRatePercent:data.contract.feeNumerator,totalDueIRR:totalDue.toString(),balanceIRR:net.toString(),balanceMeaning:net>0n?'DUE_TO_CONTRACTOR':net<0n?'OVERPAYMENT_VS_VERIFIED_LEDGER':'BALANCED',excludedUnverified:{costs:data.costs.filter(r=>r.status==='unverified').length,payments:data.payments.filter(r=>r.status==='unverified').length},duplicates,holdsForReview:duplicates.length>0||all.some(r=>r.status==='unverified'),feeRounding:'FLOOR_TO_WHOLE_IRR',scope:'Verified first-occurrence IDs only; duplicate IDs excluded from repeated totals and flagged; no tax/retentions/contractual entitlement implied'};
 const json=JSON.stringify(report,null,2)+'\n',hash=crypto.createHash('sha256').update(json).digest('hex');
 return {report,receipt:{schema:'MANA_FINANCE_REPORT_RECEIPT_V1',sha256:hash,bytes:Buffer.byteLength(json),productionPostingAllowed:false},files:{'finance-audit.json':json,'finance-audit.md':`# Finance Audit ${data.projectId}\n\nAll amounts in IRR, verified provided entries only.\n\nCosts: ${report.verifiedCostsIRR}\nPayments: ${report.verifiedPaymentsIRR}\nManagement fee: ${report.managementFeeIRR} (${data.contract.feeNumerator}% of verified costs)\nBalance: ${report.balanceIRR} (${report.balanceMeaning})\nUnverified items: ${report.excludedUnverified.costs} costs, ${report.excludedUnverified.payments} payments.\nDuplicate ID observations: ${duplicates.length}.\nReview required: ${report.holdsForReview}.\n\nThis is a reconciliation, not a legal entitlement determination.\n`}};
}
module.exports={auditLedger,validate};
