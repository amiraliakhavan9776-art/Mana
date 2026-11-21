'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {createReceiptStore}=require('./receipt.cjs');
const slot={id:'docs-python312',version:'1',pins:{catalog:'test',grader:'sample'}};
function root(t){
 const d=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mana-research-receipt-')));
 fs.chmodSync(d,0o700);t.after(()=>fs.rmSync(d,{force:true,recursive:true}));return d;
}
const file=(d,name)=>path.join(d,name+'.json');
const store=(workspace,id=slot)=>createReceiptStore({workspace,slot:id});
function worker(workspace,mode){
 return new Promise((resolve,reject)=>{
  const source=`const {createReceiptStore}=require(process.argv[1]);
   const store=createReceiptStore({workspace:process.argv[2],slot:JSON.parse(process.argv[3])});
   const hit=store.claim();
   if(hit.state==='CLAIMED'&&process.argv[4]==='commit') {
    setTimeout(()=>{console.log(JSON.stringify({state:hit.state,value:hit.commit({status:'REVIEW_REQUIRED'})}));},100);
   }else console.log(JSON.stringify(hit));`;
  const p=spawn(process.execPath,['-e',source,require.resolve('./receipt.cjs'),workspace,JSON.stringify(slot),mode],{env:{},stdio:['ignore','pipe','pipe']});
  let out='',errs='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>errs+=v);
  p.on('error',reject);p.on('close',c=>{try{assert.equal(c,0,errs);resolve(JSON.parse(out));}catch(e){reject(e);}});
 });
}

test('read is inert, winning claim alone commits, terminal replays across reopened store and cannot be overwritten',t=>{
 const dir=root(t),s=store(dir),r={status:'REVIEW_REQUIRED',tests:{passed:16,total:16}};
 assert.deepEqual(s.read(),{state:'EMPTY'});assert.deepEqual(fs.readdirSync(dir),[]);
 const c=s.claim();assert.equal(c.state,'CLAIMED');
 assert.deepEqual(store(dir).read(),{state:'UNKNOWN',claimSha256:c.claimSha256});
 const terminal=c.commit(r);assert.deepEqual(terminal.result,r);assert.equal(terminal.state,'TERMINAL');
 const before=fs.readFileSync(file(dir,'terminal'));assert.deepEqual(store(dir,{pins:{grader:'sample',catalog:'test'},version:'1',id:slot.id}).claim(),terminal);
 assert.throws(()=>c.commit({status:'OTHER'}),{code:'CLAIM_NOT_CURRENT'});
 assert.deepEqual(fs.readFileSync(file(dir,'terminal')),before);
 assert.deepEqual(fs.readdirSync(dir).sort(),['claim.json','terminal.json']);
});

test('five genuine concurrent processes grant exactly one claim; replay is terminal',async t=>{
 const d=root(t);const rows=await Promise.all(Array.from({length:5},()=>worker(d,'commit')));
 assert.equal(rows.filter(x=>x.state==='CLAIMED').length,1);
 assert(rows.every(x=>['CLAIMED','UNKNOWN','TERMINAL'].includes(x.state)));
 assert.deepEqual(store(d).claim().result,{status:'REVIEW_REQUIRED'});
});

test('process exit after claim is UNKNOWN forever, never a second execution',async t=>{
 const d=root(t);const original=await worker(d,'no-commit');assert.equal(original.state,'CLAIMED');
 const disk=fs.readFileSync(file(d,'claim'));assert.equal(fs.existsSync(file(d,'terminal')),false);
 assert.deepEqual(await worker(d,'commit'),{state:'UNKNOWN',claimSha256:original.claimSha256});
 assert.deepEqual(fs.readFileSync(file(d,'claim')),disk);
});

test('foreign slot or workspace, changed evidence, orphan terminal and corruption do not read as success',t=>{
 const d=root(t),c=store(d).claim();c.commit({status:'REVIEW_REQUIRED',bytes:12});
 assert.throws(()=>store(d,{...slot,pins:{...slot.pins,grader:'changed'}}).read(),{code:'CLAIM_BINDING_MISMATCH'});
 const other=root(t);
 for(const k of ['claim','terminal'])fs.copyFileSync(file(d,k),file(other,k));
 assert.throws(()=>store(other).claim(),{code:'CLAIM_BINDING_MISMATCH'});
 fs.unlinkSync(file(other,'claim'));
 assert.throws(()=>store(other).read(),{code:'ORPHAN_TERMINAL_RECEIPT'});
 const altered=JSON.parse(fs.readFileSync(file(d,'terminal'),'utf8'));altered.result.bytes=13;
 fs.writeFileSync(file(d,'terminal'),JSON.stringify(altered)+'\n');
 assert.throws(()=>store(d).claim(),{code:'CORRUPT_TERMINAL'});
 for(const data of ['{"schema":','null\n','false\n','{"schema":"x","schema":"y"}\n']){
  fs.writeFileSync(file(d,'terminal'),data);
  assert.throws(()=>store(d).read(),{code:'CORRUPT_RECEIPT'});
 }
});

test('rejects permissive, noncanonical, replaced and symlinked workspace or receipt files',t=>{
 const d=root(t),other=root(t),sym=path.join(other,'aliased');
 fs.symlinkSync(d,sym,'dir');
 assert.throws(()=>store(sym),{code:'PRIVATE_WORKSPACE_REQUIRED'});
 assert.throws(()=>store(d+'/'),{code:'PRIVATE_WORKSPACE_REQUIRED'});
 fs.chmodSync(d,0o750);assert.throws(()=>store(d),{code:'PRIVATE_WORKSPACE_REQUIRED'});
 fs.chmodSync(d,0o700);const s=store(d);
 fs.symlinkSync(file(other,'claim'),file(d,'claim'));
 assert.throws(()=>s.read(),{code:'INVALID_RECEIPT_FILE'});
 fs.unlinkSync(file(d,'claim'));
 const moved=path.join(other,'moved');
 fs.renameSync(d,moved);fs.mkdirSync(d,{mode:0o700});
 assert.throws(()=>s.claim(),{code:'WORKSPACE_CHANGED'});
});

test('invalid terminal is rejected without terminal publication; unlinked stage is inert',t=>{
 const d=root(t);fs.writeFileSync(path.join(d,'.receipt-stage-abandoned.tmp'),'incomplete',{mode:0o600});
 const s=store(d),c=s.claim();
 assert.throws(()=>c.commit({value:Infinity}),{code:'INVALID_RECEIPT_DATA'});
 assert.throws(()=>c.commit({text:'x'.repeat(270000)}),{code:'RECEIPT_TOO_LARGE'});
 assert.equal(s.read().state,'UNKNOWN');
 assert.equal(fs.existsSync(file(d,'terminal')),false);
 assert.equal(c.commit({status:'EXECUTION_BLOCKED'}).state,'TERMINAL');
});
