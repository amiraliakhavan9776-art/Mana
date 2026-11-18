'use strict';
// Portable adaptation of mana-master-next.cjs. Trusted fixed tests only; fail closed.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const missions=Object.freeze([
 {id:'b2a25ed5f5cdb0ae',title:'اجرای وابستگی‌های نوع‌دار',file:'tests/typed-dependency-contract-v03.test.cjs',names:['malformed upstream output is blocked by outputContract','valid upstream output remains executable']},
 {id:'1cbe338190bce8d1',title:'ذخیرهٔ وضعیت، بازیابی، توقف و ادامهٔ مأموریت',file:'tests/typed-dependency-acceptance-v01.test.cjs',names:['dependency results, durable restart, completion and idempotent request','pause, resume and cancel use version fencing']}
]);
function readRegular(file,max=1048576){const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>max)throw Error('Invalid source or receipt file');return fs.readFileSync(file);}
function sourceFiles(dir){return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('Source symlink denied');return e.isDirectory()?sourceFiles(p):e.isFile()&&e.name.endsWith('.cjs')?[p]:[];});}
function runSandbox({root,mission,signal}){
 const mounts=['--ro-bind','/usr','/usr','--ro-bind','/lib','/lib'];if(fs.existsSync('/lib64'))mounts.push('--ro-bind','/lib64','/lib64');
 const pattern='^(?:'+mission.names.map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')$';
 const args=['--unshare-all','--die-with-parent','--new-session','--cap-drop','ALL',...mounts,'--ro-bind',root,'/work','--ro-bind',process.execPath,'/node','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--chdir','/work','--clearenv','--setenv','PATH','/usr/bin:/bin','/node','--test','--test-reporter=tap','--test-name-pattern='+pattern,mission.file];
 return new Promise(resolve=>execFile('/usr/bin/bwrap',args,{encoding:'utf8',timeout:25000,killSignal:'SIGKILL',maxBuffer:1048576,env:{},signal},(error,stdout,stderr)=>resolve({code:error?error.code:0,stdout:stdout||'',stderr:stderr||'',interrupted:!!error?.killed||error?.name==='AbortError'})));
}
function passed(result,mission){
 const names=[...result.stdout.matchAll(/^ok \d+ - (.+)$/gm)].filter(m=>!m[1].includes('# SKIP')).map(m=>m[1]);
 return result.code===0&&names.length===mission.names.length&&mission.names.every(n=>names.includes(n))&&/^# fail 0$/m.test(result.stdout)&&!/^not ok /m.test(result.stdout);
}
function createDevelopmentRunner({workspace,root=ROOT,execute=runSandbox}={}){
 if(typeof workspace!=='string'||!path.isAbsolute(workspace))throw Error('Set MANA_DEVELOPMENT_WORKSPACE to a dedicated absolute staging directory');
 root=fs.realpathSync(root);
 if(path.resolve(workspace)===root||path.resolve(workspace).startsWith(root+path.sep))throw Error('Workspace must be outside source tree');
 fs.mkdirSync(workspace,{recursive:true,mode:0o700});
 const st=fs.lstatSync(workspace);if(!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(workspace)!==path.resolve(workspace)||(st.mode&0o077))throw Error('Private real workspace (0700) required');
 const queuePath=path.join(root,'capability-registry/development-queue-v01.json');
 function identity(mission){
  const queue=JSON.parse(readRegular(queuePath));
  if(!Array.isArray(queue.missions)||!queue.missions.some(m=>m.id===mission.id&&m.productionDeploymentAllowed===false))throw Error('Mission absent from source queue');
  const files=[...sourceFiles(path.join(root,'src')),path.join(root,mission.file),queuePath];
  const sourceHashes=Object.fromEntries(files.map(file=>[path.relative(root,file),sha(readRegular(file))]));
  const value={schema:'MANA_DEVELOPMENT_BENCHMARK_V1',masterPlan:'MANA AI / Jarvis v1.1 §§3.1–3.5, 11 phase 1, 12, 17',mission,sourceHashes,node:process.version,nodeSha256:sha(readRegular(process.execPath,200000000)),sandboxSha256:fs.existsSync('/usr/bin/bwrap')?sha(readRegular('/usr/bin/bwrap')):null,platform:process.platform,arch:process.arch,sandbox:'bwrap-unshare-all-v1'};
  return {...value,key:sha(JSON.stringify(value))};
 }
 function receipts(){return fs.readdirSync(workspace).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).map(n=>{
  const r=JSON.parse(readRegular(path.join(workspace,n),100000));
  if(r.key+'.json'!==n||r.schema!=='MANA_DEVELOPMENT_BENCHMARK_V1'||!missions.some(m=>m.id===r.mission?.id)||!['BENCHMARK_PASSED','REVIEW_REQUIRED','EXECUTION_BLOCKED'].includes(r.status))throw Error('Invalid receipt; manual inspection required');return r;
 });}
 function history(){return receipts().sort((a,b)=>b.at-a.at).slice(0,20).map(r=>({title:r.mission.title,status:r.status,time:r.at,key:r.key}));}
 async function run(){
  const lockPath=path.join(workspace,'run.lock');let lock;
  try{lock=fs.openSync(lockPath,'wx',0o600);}catch(error){if(error.code==='EEXIST')return {status:'EXECUTION_BLOCKED',reason:'قفل اجرا موجود است؛ پس از بررسی توقف پردازش‌ها و حفظ شواهد، بازیابی دستی لازم است.'};throw error;}
  try{
   // A prior interruption is never silently replayed. The operator retains the receipt.
   if(fs.readdirSync(workspace).some(n=>/^[a-f0-9]{64}\.pending$/.test(n)))return {status:'EXECUTION_BLOCKED',reason:'اجرای قبلی نتیجهٔ قطعی ندارد؛ بررسی دستی و حفظ شواهد لازم است.'};
   const rows=receipts();
   for(const mission of missions){
    const id=identity(mission),old=rows.find(r=>r.key===id.key);
    if(old){if(old.status==='BENCHMARK_PASSED'&&passed({code:0,stdout:old.output},mission))continue;return {...old,reused:true};}
    const selectedBecause='اولین مأموریت متصل به صف سند که برای این نسخهٔ کد و آزمون، رسید موفق ندارد؛ هسته و بازیابی پیش از توسعهٔ قابلیت‌های بعدی بررسی می‌شوند.';
    const pending=path.join(workspace,id.key+'.pending');
    const claim=fs.openSync(pending,'wx',0o600);try{fs.writeFileSync(claim,JSON.stringify({key:id.key,missionId:mission.id,at:Date.now(),status:'IN_FLIGHT'}));fs.fsyncSync(claim);}finally{fs.closeSync(claim);}
    const claimDirectory=fs.openSync(workspace,'r');try{fs.fsyncSync(claimDirectory);}finally{fs.closeSync(claimDirectory);}
    const result=await execute({root,mission});
    if(identity(mission).key!==id.key)throw Error('Source changed during benchmark; result rejected');
    const success=passed(result,mission),failure=/^not ok \d+ - /m.test(result.stdout);
    const status=success?'BENCHMARK_PASSED':failure?'REVIEW_REQUIRED':'EXECUTION_BLOCKED';
    const report={...id,status,selectedBecause,at:Date.now(),scope:'Only the exact named regression tests; not product or server acceptance',productionDeploymentAllowed:false,modelTrainingPerformed:false,output:result.stdout.slice(-12000),reason:success?'دو آزمون مستقل نام‌برده قبول شد.':failure?'آزمون ناموفق بود؛ بدون تکرار خودکار نیازمند بازبینی است.':'محیط ایزوله در دسترس نیست یا اجرای آزمون تأیید نشد؛ هیچ قبولی ثبت نشده است.',error:result.stderr.slice(-1200)||null};
    // Blocked starts are recorded too: manual review, never hidden retries after uncertainty.
    const target=path.join(workspace,id.key+'.json'),tmp=path.join(workspace,'.'+id.key+'.tmp');
    const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(report,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    try{fs.linkSync(tmp,target);}finally{fs.unlinkSync(tmp);}
    const directory=fs.openSync(workspace,'r');try{fs.fsyncSync(directory);}finally{fs.closeSync(directory);}
    fs.unlinkSync(pending);
    return report;
   }
   return {status:'SUPPORTED_BENCHMARKS_COMPLETE',missions:missions.map(m=>m.id),productionDeploymentAllowed:false};
  }finally{fs.closeSync(lock);fs.unlinkSync(lockPath);}
 }
 return Object.freeze({run,history});
}
module.exports={createDevelopmentRunner,runSandbox,missions,passed};
