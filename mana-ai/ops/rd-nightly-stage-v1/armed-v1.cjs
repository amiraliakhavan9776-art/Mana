'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {createNightly} = require('../../run-rd-nightly-tick.cjs');
const {createNativeRd} = require('../../src/pilot/mana-native-rd.cjs');

const config = '/etc/mana-rd-pilot';
const state = '/var/lib/mana-rd-pilot';
const defaults = Object.freeze({armPath:path.join(config,'armed-v1'), campaign:path.join(state,'campaign'),
  workspace:path.join(state,'native'), masterPath:path.join(config,'master.txt')});
const sha = b => createHash('sha256').update(b).digest('hex');
const refuse = () => { throw Error('STAGE_NOT_ARMED_OR_READY'); };

function exactBytes(p, {owner, group, mode, limit}) {
  if (fs.realpathSync(p) !== p) refuse();
  const fd = fs.openSync(p,fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.nlink!==1 || st.uid!==owner ||
        (group!==undefined && st.gid!==group) || (st.mode&0o7777)!==mode ||
        st.size<1 || st.size>limit) refuse();
    const bytes=Buffer.alloc(st.size);
    for(let o=0;o<bytes.length;){
      const n=fs.readSync(fd,bytes,o,bytes.length-o);
      if(!n) refuse();
      o+=n;
    }
    if(fs.fstatSync(fd).size!==st.size) refuse();
    return bytes;
  } finally {fs.closeSync(fd);}
}

function exactDirectory(p) {
  if (fs.realpathSync(p)!==p) refuse();
  return fs.lstatSync(p);
}

function prepareArming({armPath,campaign,workspace,masterPath},
    {serviceUid=process.geteuid?.(),serviceGid=process.getegid?.(),openNightly=createNightly,
      readBytes=exactBytes,statDirectory=exactDirectory}={}) {
  if (!Number.isSafeInteger(serviceUid) || serviceUid<=0 || !Number.isSafeInteger(serviceGid) ||
      serviceGid<=0) refuse();
  const parent=path.dirname(armPath);
  function verifyDirectory(){
    const st=statDirectory(parent);
    if (!st.isDirectory() || st.uid!==0 || st.gid!==serviceGid || (st.mode&0o7777)!==0o750) refuse();
  }
  verifyDirectory();
  const readManifest=()=>readBytes(path.join(campaign,'campaign.json'),{owner:serviceUid,mode:0o600,limit:4096});
  const claim=readManifest();
  const expected=Buffer.from('MANA_RD_PILOT_ARM_V1 '+sha(claim)+'\n','ascii');
  const armed=()=>readBytes(armPath,{owner:0,group:serviceGid,mode:0o440,limit:128}).equals(expected);
  if (!armed()) refuse();
  const x=openNightly({campaign,workspace,masterPath}).inspect();
  if (x?.status!=='READY' || x.modelCalls!==0 || x.activationAuthorized!==false ||
      x.productionAllowed!==false || x.modelTrainingPerformed!==false) refuse();
  const admission=()=>{
    verifyDirectory();
    if (!readManifest().equals(claim) || !armed()) refuse();
  };
  admission();
  return admission;
}

function checkArming(config, dependencies) {
  prepareArming(config,dependencies);
  return true;
}

function runArmedTick(config, dependencies={}) {
  const openNightly=dependencies.openNightly ?? createNightly;
  const nativeFactory=dependencies.nativeFactory ?? createNativeRd;
  const admission=prepareArming(config,dependencies);
  const {campaign,workspace,masterPath}=config;
  return openNightly({campaign,workspace,masterPath,nativeFactory:options=>{
    const rd=nativeFactory(options);
    return {inspect:()=>rd.inspect(),run:()=>{
      // The unchanged driver has durably claimed this slot at this point. A revoked
      // admission leaves it unknown and non-retriable without running the worker.
      admission();
      return rd.run();
    }};
  }}).tick();
}

if(require.main===module) {
  try {
    if (process.argv.length!==2 || Number(process.versions.node.split('.')[0])<24) refuse();
    const result=runArmedTick(defaults);
    process.stdout.write(JSON.stringify(result)+'\n');
    if(result.status.startsWith('HALTED')) process.exitCode=2;
  } catch {
    process.stdout.write('MANA_RD_PILOT_SKIPPED_NOT_ARMED_OR_READY\n');
    process.exitCode=1;
  }
}
module.exports={checkArming,runArmedTick,exactBytes};
