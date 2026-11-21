'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {derive,plan,digest,hash,need,FIELDS,MAX,LIMITATIONS,TASK}=require('./source.cjs');
const known=Object.freeze({
 '../native-rd-pilot/native-synth.cjs':'30fc3b1b5121ee61d6a86ef1ae83e223d2f5b58f547fb4dad4a4804016e1ddf6',
 '../native-rd-pilot/permission-launch.cjs':'4e5ff093f24663056604fa04be773944bc3c0e78dba3e64ae7e4ef5a5d74852a',
 '../src/native/skill-expression.cjs':'1241583c48b400833938799ea5538a7585cd8862444c930fea0b580741829261',
});
function bytes(file,max=256*1024) {
 need(typeof file==='string'&&path.isAbsolute(file),'absolute file path required');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try {
  const s=fs.fstatSync(fd);
  need(s.isFile()&&s.size>0&&s.size<=max,'nonregular/oversized input');
  const b=Buffer.alloc(s.size+1);let i=0;
  while(i<b.length){const n=fs.readSync(fd,b,i,b.length-i,null);if(n===0)break;i+=n;}
  need(i===s.size,'input size changed');return b.subarray(0,i);
 } finally {fs.closeSync(fd);}
}
const parse=b=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
const read=f=>parse(bytes(f));
const hex=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
function pinned(name) {
 const f=path.join(__dirname,name);need(hash(bytes(f))===known[name],'trusted module bytes mismatch: '+name);return f;
}
function state(root) {
 need(typeof root==='string'&&path.isAbsolute(root)&&fs.realpathSync(root)===root,'canonical absolute private workspace required');
 const st=fs.lstatSync(root);
 need(st.isDirectory()&&(st.mode&0o077)===0&&st.uid===process.getuid(),'workspace must be owner-only directory');
 return {root,dev:st.dev,ino:st.ino};
}
function durable(root,name,obj) {
 const f=path.join(root,name);
 const fd=fs.openSync(f,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,JSON.stringify(obj)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 const d=fs.openSync(root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
 try {fs.fsyncSync(d);} finally {fs.closeSync(d);}
 return f;
}
const fingerprint=()=>Object.fromEntries(['run.cjs','source.cjs'].map(n=>[n,hash(bytes(path.join(__dirname,n)))]));
function synthesize(sourceFile,root) {
 // Capture verification comes before claiming work. There is no provider or oracle parameter.
 const captureFile=bytes(sourceFile),{source,training}=derive(parse(captureFile));
 const worker=pinned('../native-rd-pilot/native-synth.cjs'),launcher=pinned('../native-rd-pilot/permission-launch.cjs');
 need(Number(process.versions.node.split('.')[0])>=24,'Node >=24 needed for initial isolated fitting');
 const identity=state(root);
 need(fs.readdirSync(root).length===0,'workspace must be empty: an earlier claim never repeats');
 const body={schema:'MANA_RESEARCH_NATIVE_CLAIM_V1',identity,source,captureFileSha256:hash(captureFile),modules:{...known,...fingerprint()},fitSha256:digest(training)};
 const claim={...body,claimSha256:digest(body)};
 durable(root,'claim.json',claim);
 const fit=durable(root,'fit-only.json',training),fitFileSha=hash(bytes(fit));
 const result=spawnSync(process.execPath,['--permission','--allow-fs-read='+worker,'--allow-fs-read='+launcher,'--allow-fs-read='+fit,launcher,worker,known['../native-rd-pilot/native-synth.cjs'],fit,fitFileSha],{
  cwd:root,env:{},stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:11000,maxBuffer:16384,
 });
 need(!result.error&&result.status===0&&result.signal===null,'learner outcome unknown; claim remains spent and is never retried');
 const out=JSON.parse(result.stdout);
 need(out.schema==='MANA_NATIVE_SYNTHESIS_RESULT_V1'&&out.task===TASK&&out.trainingExampleCount===training.examples.length&&out.trainingSha256===claim.fitSha256&&out.trainingFileSha256===fitFileSha&&out.workerSha256===known['../native-rd-pilot/native-synth.cjs']&&digest(state(root))===digest(identity),'worker or workspace provenance mismatch');
 const ready=out.status==='FROZEN_FOR_INDEPENDENT_TESTS'&&out.candidate&&out.candidateSha256===digest(out.candidate)&&!out.search.truncated&&out.search.matchedBehaviorClasses===1;
 const fields={schema:'MANA_RESEARCH_NATIVE_FREEZE_V1',status:ready?'CANDIDATE_FROZEN_FOR_INDEPENDENT_TESTS':'NO_REVIEWABLE_CANDIDATE',claimSha256:claim.claimSha256,sourceDocumentSha256:source.documentSha256,scope:LIMITATIONS,fitFileSha,fitSha256:out.trainingSha256,workerSha256:out.workerSha256,trainingExampleCount:out.trainingExampleCount,candidate:out.candidate,candidateSha256:out.candidateSha256,search:out.search,modelCalls:0,activationAuthorized:false};
 const freeze={...fields,freezeSha256:digest(fields)};
 durable(root,'frozen.json',freeze);
 return freeze;
}
function grade(root,holdout,expectedSHA) {
 const identity=state(root),evalFile=pinned('../src/native/skill-expression.cjs');
 const {claimSha256,...claim}=read(path.join(root,'claim.json'));
 need(hex(claimSha256)&&digest(claim)===claimSha256&&digest(claim.identity)===digest(identity)&&digest(claim.modules)===digest({...known,...fingerprint()}),'claim identity or provenance mismatch');
 const {freezeSha256,...freeze}=read(path.join(root,'frozen.json'));
 need(freeze.status==='CANDIDATE_FROZEN_FOR_INDEPENDENT_TESTS'&&hex(freezeSha256)&&digest(freeze)===freezeSha256&&freeze.claimSha256===claimSha256&&freeze.sourceDocumentSha256===claim.source.documentSha256&&freeze.candidateSha256===digest(freeze.candidate)&&freeze.fitSha256===claim.fitSha256,'freeze invalid or not reviewable');
 const fit=bytes(path.join(root,'fit-only.json')),p=parse(fit);
 need(freeze.fitFileSha===hash(fit)&&digest(p)===claim.fitSha256,'training evidence changed since freeze');
 const oracleBytes=bytes(holdout,32768);
 need(hex(expectedSHA)&&hash(oracleBytes)===expectedSHA,'independent grader pin mismatch');
 const check=parse(oracleBytes);
 need(check.schema==='MANA_RESEARCH_NATIVE_HOLDOUT_V1'&&digest(check.fields)===digest(FIELDS)&&Array.isArray(check.rows)&&check.rows.length>=8&&check.rows.length<=64,'invalid heldout metadata');
 const seen=new Set(p.examples.map(([r])=>r.join(',')));
 for(const r of check.rows) {
  need(Array.isArray(r.in)&&r.in.length===FIELDS.length&&r.in.every(x=>Number.isSafeInteger(x)&&x>=0&&x<=MAX)&&Number.isSafeInteger(r.out)&&r.out>=0&&r.out<=1e12,'invalid heldout input or label');
  const key=r.in.join(',');need(!seen.has(key),'duplicate or known fit vector: not a heldout');seen.add(key);
 }
 const {evaluateExpression}=require(evalFile);
 let passed=0;
 for(const r of check.rows) {
  let actual;
  try{actual=evaluateExpression(freeze.candidate,Object.fromEntries(FIELDS.map((f,i)=>[f,r.in[i]])),FIELDS);}catch{};
  if(actual===r.out)passed++;
 }
 const g={schema:'MANA_RESEARCH_NATIVE_GRADE_V1',status:passed===check.rows.length?'HELDOUT_PASSED_REVIEW_REQUIRED':'HELDOUT_FAILED',freezeSha256,sourceDocumentSha256:freeze.sourceDocumentSha256,candidateSha256:freeze.candidateSha256,holdoutFileSha256:expectedSHA,evaluatorSha256:known['../src/native/skill-expression.cjs'],scope:LIMITATIONS,heldoutPassed:passed,heldoutTotal:check.rows.length,modelCalls:0,activationAuthorized:false};
 const gradeReceipt={...g,gradeSha256:digest(g)};
 durable(root,'grade.json',gradeReceipt);
 return gradeReceipt;
}
if(require.main===module) {
 const [cmd,...args]=process.argv.slice(2);
 try{
  let out;
  if(cmd==='plan'&&args.length===0)out=plan();
  else if(cmd==='derive'&&args.length===1)out=derive(read(args[0])).source;
  else if(cmd==='synthesize'&&args.length===2)out=synthesize(...args);
  else if(cmd==='grade'&&args.length===3)out=grade(...args);
  else throw Error('Usage: run.cjs plan | derive /absolute/source.json | synthesize /absolute/source.json /absolute/private/workspace | grade /absolute/private/workspace /absolute/heldout.json <oracle-file-sha256>');
  console.log(JSON.stringify(out,null,2));
 }catch(e){console.log(JSON.stringify({status:'ABSTAIN',reason:e.message}));process.exitCode=1;}
}
module.exports={synthesize,grade};
