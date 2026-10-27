'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {calculateClaim}=require('../src/financial/claims.cjs');
const scope={organizationId:'org',projectId:'p'};
const line=(fields={})=>({id:'l',sourceRef:'contract:1',description:'Synthetic period work',quantity:'2',unitPrice:'100',unit:'item',...fields});
function fixture(){return {schemaVersion:1,id:'claim1',...scope,currency:'IRR',mode:'unit_price',policyRef:'synthetic-policy-v1',rounding:{scale:2,mode:'half_up',lineRounding:'per_line'},lines:[line()],deductions:[],tax:{rate:'0',base:'gross',sourceRef:'synthetic-tax-policy'},paidToDate:'0'};}
test('all six explicit claim modes compute period work from supplied quantities and rates',()=>{
 const cases=[['unit_price',[line()],'200.00'],['area',[line({quantity:'12.5',unitPrice:'200',unit:'m2'})],'2500.00'],['labor',[line({quantity:'8',unitPrice:'100',unit:'hour'})],'800.00'],['lump_sum',[{id:'l',sourceRef:'c:1',description:'Period tranche',amount:'3500'}],'3500.00'],['progress',[{id:'l',sourceRef:'c:1',description:'Period progress',baseAmount:'10000',periodPercent:'25'}],'2500.00'],['mixed',[{...line(),mode:'unit_price'},{id:'l2',mode:'progress',sourceRef:'c:2',description:'Progress',baseAmount:'10000',periodPercent:'25'}],'2700.00']];
 for(const [mode,lines,gross] of cases){const r=calculateClaim({...fixture(),mode,lines},scope);assert.equal(r.totals.gross,gross,mode);assert.equal(r.status,'draft_calculation');assert.equal(r.lines[0].sourceRef,lines[0].sourceRef);}
});
test('deductions, explicit tax bases, payments and overpayment are exact and separately reported',()=>{
 const input={...fixture(),deductions:[{id:'retention',kind:'percent',rate:'5',base:'gross',sourceRef:'policy:retention'},{id:'fixed',kind:'fixed',amount:'2',sourceRef:'policy:fixed'}],tax:{rate:'10',base:'after_deductions',sourceRef:'policy:tax'},paidToDate:'50'};
 const r=calculateClaim(input,scope);assert.deepEqual(r.totals,{gross:'200.00',deductions:'12.00',tax:'18.80',net:'206.80',paidToDate:'50.00',balance:'156.80'});
 assert.equal(calculateClaim({...input,tax:{...input.tax,base:'gross'}},scope).totals.net,'208.00');
 const over=calculateClaim({...input,paidToDate:'207'},scope);assert.equal(over.totals.balance,'-0.20');assert.equal(over.overpaid,true);
});
test('half-even/half-up/truncation and line/invoice boundaries are explicit',()=>{
 for(const [mode,total] of [['half_up','125.13'],['half_even','125.12'],['toward_zero','125.12']])assert.equal(calculateClaim({...fixture(),rounding:{scale:2,mode,lineRounding:'per_line'},lines:[line({quantity:'1.25',unitPrice:'100.10'})]},scope).totals.gross,total);
 const x={...fixture(),lines:[line({quantity:'1',unitPrice:'0.005'}),line({id:'l2',quantity:'1',unitPrice:'0.005'})]};
 assert.equal(calculateClaim(x,scope).totals.gross,'0.02');assert.equal(calculateClaim({...x,rounding:{...x.rounding,lineRounding:'invoice'}},scope).totals.gross,'0.01');
});
test('zero quantities/rates remain zero and large decimal strings never pass through Number arithmetic',()=>{
 assert.equal(calculateClaim({...fixture(),lines:[line({quantity:'0',unitPrice:'999'})]},scope).totals.gross,'0.00');
 const x={...fixture(),lines:[line({quantity:'1',unitPrice:'9007199254740993.01'})]};assert.equal(calculateClaim(x,scope).totals.gross,'9007199254740993.01');
 assert.equal(calculateClaim({...x,currency:'IRT'},scope).normalizedIRR.net,'90071992547409930.10');
});
test('scope, duplicate IDs, missing policy, unknown fields, ambiguous numbers and incompatible units fail closed',()=>{
 const bad=[{...fixture(),organizationId:'foreign'},{...fixture(),projectId:'foreign'},{...fixture(),rounding:undefined},{...fixture(),currency:'USD'},{...fixture(),mode:'custom'},{...fixture(),lines:[line(),line()]},{...fixture(),approve:true},{...fixture(),lines:[line({quantity:2})]},{...fixture(),lines:[line({quantity:'۲'})]},{...fixture(),mode:'area',lines:[line()]},{...fixture(),mode:'labor',lines:[line()]},{...fixture(),lines:[line({unitPrice:'1e3'})]},{...fixture(),deductions:[{id:'x',kind:'fixed',amount:'201',sourceRef:'c'}]},{...fixture(),tax:{rate:'101',base:'gross',sourceRef:'c'}}];
 for(const input of bad)assert.throws(()=>calculateClaim(input,scope));assert.throws(()=>calculateClaim(fixture()));
});
test('input is unchanged and canonical digest binds policy, amounts and source references',()=>{
 const input=fixture(),before=JSON.stringify(input),a=calculateClaim(input,scope);assert.equal(JSON.stringify(input),before);
 for(const changed of [{...input,policyRef:'other'},{...input,lines:[line({sourceRef:'other'})]},{...input,paidToDate:'1'}])assert.notEqual(calculateClaim(changed,scope).inputDigest,a.inputDigest);
});
test('rounding matrix agrees with independent Python Decimal arithmetic',()=>{
 const {spawnSync}=require('node:child_process');
 const cases=[];for(const mode of ['half_up','half_even','toward_zero'])for(const scale of [0,2])for(const quantity of ['0','0.005','0.015','1.25','2.5','9007199254740993.01'])for(const price of ['0.01','3.333333','100.10'])cases.push({mode,scale,quantity,price});
 const python='import sys,json\nfrom decimal import Decimal,localcontext,ROUND_HALF_UP,ROUND_HALF_EVEN,ROUND_DOWN\nrows=json.load(sys.stdin)\nwith localcontext() as c:\n c.prec=100\n print(json.dumps([format((Decimal(r["quantity"])*Decimal(r["price"])).quantize(Decimal(1).scaleb(-r["scale"]),rounding={"half_up":ROUND_HALF_UP,"half_even":ROUND_HALF_EVEN,"toward_zero":ROUND_DOWN}[r["mode"]]),"f") for r in rows]))';
 const oracle=spawnSync('python3',['-c',python],{input:JSON.stringify(cases),encoding:'utf8',timeout:5000,maxBuffer:100000});assert.equal(oracle.status,0,oracle.error?.message||oracle.stderr);
 const expected=JSON.parse(oracle.stdout);for(let i=0;i<cases.length;i++){const c=cases[i],actual=calculateClaim({...fixture(),rounding:{scale:c.scale,mode:c.mode,lineRounding:'per_line'},lines:[line({quantity:c.quantity,unitPrice:c.price})]},scope);assert.equal(actual.totals.gross,expected[i],JSON.stringify(c));}
});
