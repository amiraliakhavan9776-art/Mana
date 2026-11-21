'use strict';
const fs=require('node:fs'),path=require('node:path');
const {start}=require('./aec-instruction-preview.cjs');
const {createMissionSelectionRunner}=require('./mission-selection-runner.cjs');
const {createQueueResearchRunner,HOLDOUT_SHA256}=require('./runner.cjs');
const {createAecInstructionRunner,readBound}=require('./aec-instruction-runner.cjs');
const {readCapturedPanelEvidence}=require('./aec-source.cjs');
const {readOfficial}=require('./official-https.cjs');
const {readerFromDirectory}=require('./preview.cjs');
const {learnAec,readAecLearning}=require('./aec-learner.cjs');

const INDOT_CAPTURE_PINS=new Set([
 '2d78ddee786ffcba28391e053ce2ef923ad70bb6de4d0a58d136e45a0f002b33', // previous reviewed capture
 '8b034f442ac72023a658c8d9b2d08522e5c04d0abd67631bdd2b3649048228a4', // independently recaptured 2026-11-21
]);
const queuePath=path.resolve(__dirname,'../capability-registry/development-queue-v01.json');
const holdoutPath=path.join(__dirname,'holdout.json');
function privateDirectory(directory,create=false){
 if(create)try{fs.mkdirSync(directory,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
 const stat=fs.lstatSync(directory);
 if(!stat.isDirectory()||stat.uid!==process.getuid()||(stat.mode&0o077)!==0||fs.realpathSync(directory)!==directory)
  throw Error('PRIVATE_CANONICAL_WORKSPACE_REQUIRED');
}
function openMissionSelection({workspace,masterPath,cpythonSource,capturePath,captureSha256,cpythonReader,discover,pythonPath}){
 const abs=p=>typeof p==='string'&&p.length<4096&&!p.includes('\0')&&path.isAbsolute(p)&&path.resolve(p)===p;
 const indotDirect=pythonPath!==undefined;
 if(indotDirect&&(!abs(pythonPath)||capturePath!==undefined||captureSha256!==undefined||discover!==undefined))throw Error('INDOT_DIRECT_REQUIRES_EXPLICIT_ABSOLUTE_PYTHON_AND_NO_CAPTURE');
 const indotInput=indotDirect?pythonPath:capturePath;
 if(![workspace,masterPath,indotInput].every(abs)||!(cpythonSource==='--official-https'||abs(cpythonSource))||
    [masterPath,indotInput,cpythonSource].some(p=>p===workspace||p.startsWith(workspace+path.sep)))throw Error('INPUTS_MUST_BE_OUTSIDE_PRIVATE_STATE');
 if(!indotDirect&&!discover&&!INDOT_CAPTURE_PINS.has(captureSha256))throw Error('REVIEWED_INDOT_CAPTURE_PIN_REQUIRED');
 privateDirectory(workspace);
 const masterBytes=readBound(masterPath,128*1024),queueBytes=readBound(queuePath,128*1024);
 const cpy=path.join(workspace,'research'),aec=path.join(workspace,'quantity');
 for(const lane of [cpy,aec])privateDirectory(lane,true);
 const live=cpythonSource==='--official-https';
 const cpythonRunner=createQueueResearchRunner({workspace:cpy,queueBytes,holdoutPath,holdoutSha256:HOLDOUT_SHA256,sourceMode:live?'official-https':'pinned-replay',readOfficial:cpythonReader??(live?readOfficial:readerFromDirectory(cpythonSource))});
 // The injected discovery hook is for in-process integration; an HTTP caller cannot select it.
 const aecRunner=createAecInstructionRunner({workspace:aec,masterBytes,queueBytes,sourceMode:indotDirect?'direct':discover?'host-mediated':'pinned-replay',discover:indotDirect?(()=>require('./indot-direct.cjs').discoverDirectPanelEvidence({pythonPath})):discover??(()=>readCapturedPanelEvidence(capturePath,captureSha256)),learn:learnAec,readLearning:readAecLearning});
 return createMissionSelectionRunner({masterBytes,queueBytes,cpythonRunner,aecRunner});
}
if(require.main===module){
 const [workspace,masterPath,cpythonSource,indotChoice,indotValue,...extra]=process.argv.slice(2);
 if(extra.length||indotChoice===undefined||indotValue===undefined||Number(process.versions.node.split('.')[0])<24)throw Error('Node 24+; usage: mission-selection-preview.cjs /private/state /private/master.txt --official-https|/private/cpython-captures /private/indot-capture.json capture-sha256 OR --indot-https /absolute/python');
 const indot=indotChoice==='--indot-https'?{pythonPath:indotValue}:{capturePath:indotChoice,captureSha256:indotValue};
 const runner=openMissionSelection({workspace,masterPath,cpythonSource,...indot});
 const server=start({port:Number(process.env.MANA_MISSION_SELECTION_PORT??0),runner,missionSelection:true});
 server.once('listening',()=>console.log('MANA queue CPU staging: http://127.0.0.1:'+server.address().port));
 server.once('error',e=>{console.error('MANA_QUEUE_LISTEN_FAILED',e.code??'UNKNOWN');process.exitCode=1;});
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>server.close());
}
module.exports={openMissionSelection};
