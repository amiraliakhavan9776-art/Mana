'use strict';
// Fixed local checks only. Never executes model-generated commands or deploys code.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function verifyLab({outputDirectory,pythonCommand='python3',sandbox=false}={}){
 if(typeof outputDirectory!=='string'||!path.isAbsolute(outputDirectory))throw Error('Absolute new output directory required');
 fs.mkdirSync(outputDirectory,{mode:0o700});
 const nodeTests=['tests','mana-ai/tests'].flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(name=>name.endsWith('.test.cjs')).sort().map(name=>path.join(dir,name)));
 const commands=[['node-regressions',process.execPath,['--test','--test-reporter=tap',...nodeTests]],['python-regressions',pythonCommand,['-m','unittest','discover','-s','mana-ai/training','-p','test_*.py','-q']],['resource-schedule',process.execPath,['mana-ai/plan-project.cjs',path.join(root,'mana-ai/examples/project-schedule.json')]],['sandbox',process.execPath,[sandbox?'mana-ai/sandbox-acceptance.cjs':'mana-ai/sandbox-preflight.cjs']]];
 const results=[];
 for(const [id,command,args] of commands){
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',PYTHONDONTWRITEBYTECODE:'1'}});
  const log=String(result.stdout??'')+String(result.stderr??'')+(result.error?'\n'+result.error.message:'');
  fs.writeFileSync(path.join(outputDirectory,id+'.log'),log,{flag:'wx',mode:0o600});
  const counts={};if(id==='node-regressions')for(const match of log.matchAll(/^# (tests|pass|fail|skipped) (\d+)$/gm))counts[match[1]]=Number(match[2]);
  const completeCounts=id!=='node-regressions'||['tests','pass','fail','skipped'].every(k=>Number.isSafeInteger(counts[k]));
  const status=result.status===0&&!result.error&&completeCounts?(counts.skipped>0?'PASSED_WITH_SKIPS':'PASSED'):'BLOCKED_OR_FAILED';
  results.push({id,status,exitCode:result.status,signal:result.signal??null,...(id==='node-regressions'?{testCounts:counts}:{}),logFile:id+'.log',logSha256:crypto.createHash('sha256').update(log).digest('hex')});
 }
 const report={schema:'MANA_LAB_VERIFICATION_V1',status:results.every(r=>r.status==='PASSED')?'LAB_CHECKS_PASSED':'LAB_CHECKS_INCOMPLETE',sandboxAcceptanceExecuted:sandbox,results,masterPlanComplete:false,generalCodingAcceptance:false,productionDeploymentAllowed:false,modelsChanged:false};
 fs.writeFileSync(path.join(outputDirectory,'verification.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});return report;
}
module.exports={verifyLab};
if(require.main===module){
 try{const args=process.argv.slice(2);if(args.length<1||args.length>2||(args.length===2&&args[1]!=='--sandbox'))throw Error('Usage: node mana-ai/verify-lab.cjs /absolute/new/report-directory [--sandbox]');const result=verifyLab({outputDirectory:args[0],sandbox:args[1]==='--sandbox'});console.log(JSON.stringify(result,null,2));if(result.status!=='LAB_CHECKS_PASSED')process.exitCode=2;}
 catch(error){console.error(error.message);process.exitCode=1;}
}
