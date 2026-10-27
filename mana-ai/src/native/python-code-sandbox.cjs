'use strict';
// Narrow Linux/x86_64 pure-function benchmark sandbox, never a host execution fallback.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {parseExactJSON}=require('../exact-json.cjs');
const {readRegular}=require('./skill-evolution.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function seccompFilter(){
 // Classic BPF: enforce native x86_64, reject x32, then block new processes,
 // threads/network sockets and namespace/kernel administration. Python needs no fork.
 const rows=[[0x20,0,0,4],[0x15,1,0,0xc000003e],[0x06,0,0,0x80000000],[0x20,0,0,0],[0x35,0,1,0x40000000],[0x06,0,0,0x00050001]];
 const denied=[41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,101,155,165,166,169,175,176,246,248,249,250,272,298,303,304,308,310,311,313,320,321,323,425,426,427,435];
 for(const nr of denied)rows.push([0x15,0,1,nr],[0x06,0,0,0x00050001]);rows.push([0x06,0,0,0x7fff0000]);
 const bytes=Buffer.alloc(rows.length*8);rows.forEach(([code,jt,jf,k],i)=>{bytes.writeUInt16LE(code,i*8);bytes[i*8+2]=jt;bytes[i*8+3]=jf;bytes.writeUInt32LE(k,i*8+4);});return bytes;
}
const PROBE=`import os,socket,json\nassert not os.path.exists('/root') and not os.path.exists('/etc/passwd')\nassert 'MANA_HOST_SECRET' not in os.environ\nfor operation in [lambda: socket.socket(), lambda: os.fork(), lambda: open('/candidate.py','a')]:\n    try:\n        operation()\n    except OSError:\n        pass\n    else:\n        raise RuntimeError('isolation_failure')\nprint(json.dumps({'isolated':True}))\n`;
const HARNESS=`import json,runpy,sys\nmodule=runpy.run_path('/candidate.py')\nfunction=module[sys.argv[1]]\nresult=function(json.loads(sys.argv[2]))\nprint(json.dumps({'result':result},allow_nan=False,separators=(',',':')))\n`;
function createPythonCodeSandbox({python='/usr/bin/python3',bwrap='/usr/bin/bwrap',prlimit='/usr/bin/prlimit',timeoutMs=5000}={}){
 if(![python,bwrap,prlimit].every(p=>typeof p==='string'&&path.isAbsolute(p))||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)throw Error('Explicit bounded sandbox configuration required');
 let configured=null,receipt=null;
 function configure(){
  if(process.platform!=='linux'||process.arch!=='x64'||![python,bwrap,prlimit].every(p=>fs.existsSync(p)))return false;
  const query=spawnSync(python,['-I','-S','-c',"import sys,sysconfig,os,json; print(json.dumps({'executable':os.path.realpath(sys.executable),'stdlib':sysconfig.get_path('stdlib'),'shared':os.path.join(sysconfig.get_config_var('LIBDIR') or '',sysconfig.get_config_var('LDLIBRARY') or '')}))"],{encoding:'utf8',timeout:2000,maxBuffer:8192,env:{}});
  try{if(query.status!==0)throw Error();const result=JSON.parse(query.stdout);if(![result.executable,result.stdlib].every(p=>path.isAbsolute(p)&&fs.existsSync(p)))throw Error();configured=result;return true;}catch{return false;}
 }
 function execute(source,script,args=[]){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mana-code-sandbox-'));fs.chmodSync(directory,0o700);
  let fd;
  try{
   const candidate=path.join(directory,'candidate.py'),filter=path.join(directory,'seccomp.bpf'),empty=path.join(directory,'empty');fs.mkdirSync(empty);fs.writeFileSync(candidate,source,{mode:0o600});fs.writeFileSync(filter,seccompFilter(),{mode:0o600});fd=fs.openSync(filter,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
   const limits=['--as=268435456','--cpu=3','--fsize=1048576','--nofile=32','--nproc=16','--core=0'];
   const flags=['--unshare-all','--die-with-parent','--new-session','--cap-drop','ALL','--clearenv','--setenv','PYTHONHOME','/runtime','--setenv','PYTHONDONTWRITEBYTECODE','1','--setenv','LD_LIBRARY_PATH','/runtime/lib','--dir','/runtime/bin','--dir','/runtime/lib', '--ro-bind',configured.executable,'/runtime/bin/python3','--ro-bind',configured.stdlib,'/runtime/lib/python'+path.basename(configured.stdlib).replace(/^python/,'')];
   // Only interpreter libraries, no /usr/bin, host homes, /opt, project tree or secrets.
   for(const libraryRoot of ['/lib','/lib64','/usr/lib'])if(fs.existsSync(libraryRoot))flags.push('--ro-bind',libraryRoot,libraryRoot);
   if(configured.shared&&fs.existsSync(configured.shared))flags.push('--ro-bind',configured.shared,'/runtime/lib/'+path.basename(configured.shared));
   for(const packages of ['site-packages','dist-packages'])if(fs.existsSync(path.join(configured.stdlib,packages)))flags.push('--ro-bind',empty,'/runtime/lib/'+path.basename(configured.stdlib)+'/'+packages);
   flags.push('--ro-bind',candidate,'/candidate.py','--proc','/proc','--remount-ro','/proc','--dev','/dev','--size','16777216','--tmpfs','/tmp','--chdir','/tmp','--remount-ro','/','--seccomp','3','/runtime/bin/python3','-S','-c',script,...args);
   const result=spawnSync(prlimit,[...limits,bwrap,...flags],{encoding:'utf8',timeout:timeoutMs,killSignal:'SIGKILL',maxBuffer:65536,env:{},stdio:['ignore','pipe','pipe',fd]});
   return {status:result.status,stdout:result.stdout??'',failed:!!result.error||result.status!==0};
  }finally{if(fd!==undefined)fs.closeSync(fd);fs.rmSync(directory,{recursive:true,force:true});}
 }
 function preflight(){
  if(!configure())return {status:'SANDBOX_UNAVAILABLE',candidateExecuted:false};
  const result=execute('# trusted preflight only\n',PROBE);
  try{if(result.failed||parseExactJSON(result.stdout).isolated!==true)throw Error();receipt={status:'SANDBOX_PREFLIGHT_PASSED',policy:'MANA_PYTHON_BWRAP_X64_V1',filterSha256:hash(seccompFilter()),pythonSha256:hash(fs.readFileSync(configured.executable))};return {...receipt,candidateExecuted:false};}catch{receipt=null;return {status:'SANDBOX_UNAVAILABLE',candidateExecuted:false};}
 }
 function evaluate({sourceFile,functionName='solve',tests}){
  if(typeof functionName!=='string'||!/^[a-z][a-z0-9_]{0,39}$/.test(functionName)||!Array.isArray(tests)||tests.length<3||tests.length>32)throw Error('Independent bounded test contract required');
  for(const test of tests){if(!test||Object.keys(test).sort().join(',')!=='expected,input'||Buffer.byteLength(JSON.stringify(test))>8192)throw Error('Bounded test data required');parseExactJSON(JSON.stringify(test));}
  // Trusted probe must succeed before any arbitrary candidate is loaded.
  const availability=preflight();if(availability.status!=='SANDBOX_PREFLIGHT_PASSED')return availability;
  const source=readRegular(sourceFile,64000),candidateSha256=hash(source),results=[];
  for(let index=0;index<tests.length;index++){
   const run=execute(source,HARNESS,[functionName,JSON.stringify(tests[index].input)]);let pass=false;
   try{const output=parseExactJSON(run.stdout);pass=!run.failed&&Object.keys(output).join(',')==='result'&&require('node:util').isDeepStrictEqual(output.result,tests[index].expected);}catch{}
   results.push({index,pass});
  }
  return {status:results.every(r=>r.pass)?'BENCHMARK_PASSED_AWAITING_REVIEW':'BENCHMARK_FAILED',candidateSha256,policy:receipt.policy,filterSha256:receipt.filterSha256,results,total:tests.length,passed:results.filter(r=>r.pass).length,candidateExecuted:true,approved:false,productionDeploymentAllowed:false};
 }
 return Object.freeze({preflight,evaluate});
}
module.exports={createPythonCodeSandbox,seccompFilter};
