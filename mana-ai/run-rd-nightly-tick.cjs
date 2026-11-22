'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {parseExactJSON} = require('./src/exact-json.cjs');
const {payloadDigest} = require('./src/approval-store.cjs');
const {createNativeRd} = require('./src/pilot/mana-native-rd.cjs');

const SCHEMA = 'MANA_NATIVE_RD_NIGHTLY_V1';
const RESERVATION = 'mana-nightly-owner.json';
const HOURS = 12;
const MISSIONS = Object.freeze(['net-finish-length-mm', 'uniform-layer-volume-mm3']);
const SAFE = Object.freeze({modelCalls:0, activationAuthorized:false, productionAllowed:false, modelTrainingPerformed:false});
const review = 'AWAITING_HUMAN_REVIEW';
const validHash = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const same = (a,b) => payloadDigest(a) === payloadDigest(b);
const die = code => { throw Error(code); };
const uid = process.getuid?.();
const allSafe = o => o && Object.entries(SAFE).every(([k,v]) => o[k] === v);
const report = (status, detail = {}) => ({status, ...detail, ...SAFE});
const inside = (a,b) => a === b || b.startsWith(a + path.sep);
const identity = st => [String(st.dev), String(st.ino)];
const executable = () => createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');

function privateDirectory(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || path.resolve(p) !== p || fs.realpathSync(p) !== p)
    die('CANONICAL_PRIVATE_DIRECTORY_REQUIRED');
  const st = fs.lstatSync(p, {bigint:true});
  if (!st.isDirectory() || (st.mode & 0o077n) || (uid !== undefined && st.uid !== BigInt(uid)))
    die('CANONICAL_PRIVATE_DIRECTORY_REQUIRED');
  return identity(st);
}

function save(dir, name, value) {
  const fd = fs.openSync(path.join(dir,name), 'wx', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value) + '\n');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  const dfd = fs.openSync(dir, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
}

function load(dir,name) {
  const fd = fs.openSync(path.join(dir,name),fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1 || (st.mode & 0o077) || (uid !== undefined && st.uid !== uid) ||
        st.size < 1 || st.size > 4096) die('INVALID_CAMPAIGN_RECORD');
    const b = Buffer.alloc(st.size);
    for(let i=0;i<b.length;){
      const n=fs.readSync(fd,b,i,b.length-i);
      if(!n) die('INVALID_CAMPAIGN_RECORD');
      i += n;
    }
    if(fs.fstatSync(fd).size !== st.size) die('INVALID_CAMPAIGN_RECORD');
    return parseExactJSON(new TextDecoder('utf-8',{fatal:true}).decode(b));
  } finally { fs.closeSync(fd); }
}

function goodOutcome(o, mission) {
  const s = o?.score;
  return o?.status === review && o.mission === mission && validHash(o.digest) &&
    s?.testsRun === 24 && Array.isArray(s.insensitive) && s.insensitive.length === 0 &&
    s.regression?.passed === 8 && s.regression.total === 8 &&
    s.fresh?.passed === 16 && s.fresh.total === 16 && validHash(s.regressionSha256) &&
    s.unit === (mission === MISSIONS[0] ? 'mm' : 'mm3');
}

function createNightly({campaign, workspace, masterPath, nativeFactory=createNativeRd, now=Date.now} = {}) {
  const campaignIdentity = privateDirectory(campaign);
  const workspaceIdentity = privateDirectory(workspace);
  if (typeof masterPath !== 'string' || !path.isAbsolute(masterPath) || path.resolve(masterPath) !== masterPath ||
      inside(campaign,workspace) || inside(workspace,campaign) ||
      [campaign, workspace].some(x => [masterPath,__dirname].some(y => inside(x,y) || inside(y,x))))
    die('SEPARATE_PRIVATE_PATHS_REQUIRED');
  const parent = path.dirname(campaign);
  if (path.dirname(workspace) !== parent || inside(parent,masterPath) ||
      inside(parent,__dirname) || inside(__dirname,parent))
    die('COMMON_PRIVATE_CAMPAIGN_PARENT_REQUIRED');
  const parentIdentity = privateDirectory(parent);
  const scriptSha256 = executable();
  const binding = {schema:SCHEMA, parent, campaign, workspace, masterPath, parentIdentity,
    campaignIdentity, workspaceIdentity, scriptSha256};
  const current = () => {
    if (!same(privateDirectory(parent),parentIdentity) ||
        !same(privateDirectory(campaign),campaignIdentity) || !same(privateDirectory(workspace),workspaceIdentity) ||
        executable() !== scriptSha256) die('CAMPAIGN_CONTEXT_CHANGED');
  };
  function time() {
    const t = now();
    if (!Number.isSafeInteger(t) || t < 0 || t > 8e15) die('INVALID_CAMPAIGN_CLOCK');
    return t;
  }
  const names = ['campaign.json', ...MISSIONS.flatMap((_,i)=>[claimName(i), resultName(i)])];
  function claimName(i) { return 'attempt-' + (i+1) + '.claim.json'; }
  function resultName(i) { return 'attempt-' + (i+1) + '.result.json'; }
  const native = () => nativeFactory({workspace,masterPath});
  function checked(rd) {
    const x = rd.inspect();
    if (!allSafe(x) || !Array.isArray(x.outcomes) || x.outcomes.length > MISSIONS.length)
      die('NATIVE_INSPECTION_UNVERIFIED');
    return x;
  }
  function init() {
    current();
    if (fs.readdirSync(campaign).length || fs.readdirSync(workspace).length)
      die('NEW_EMPTY_WORKSPACES_REQUIRED');
    const candidates = [path.basename(campaign),path.basename(workspace)].sort();
    if (!same(fs.readdirSync(parent).sort(),candidates)) die('PARENT_ALREADY_RESERVED_OR_NOT_EMPTY');
    const state = checked(native());
    if (state.status !== 'READY' || state.mission !== MISSIONS[0] || state.outcomes.length)
      die('FRESH_NATIVE_CASE_REQUIRED');
    const startedAt = time();
    // Reserve the shared parent before publishing the manifest. A partial reservation is never retried.
    current();
    try {save(parent,RESERVATION,binding);}
    catch(e) {if (e.code==='EEXIST') die('PARENT_ALREADY_RESERVED_OR_NOT_EMPTY'); throw e;}
    current();
    if (fs.readdirSync(campaign).length || fs.readdirSync(workspace).length)
      die('NEW_EMPTY_WORKSPACES_REQUIRED');
    save(campaign,'campaign.json',{binding,startedAt,expiresAt:startedAt+HOURS*3600000,maxAttempts:MISSIONS.length});
    return report('INITIALIZED',{startedAt,expiresAt:startedAt+HOURS*3600000,maxAttempts:MISSIONS.length});
  }
  function journal() {
    current();
    const entries = fs.readdirSync(campaign);
    if (entries.some(n=>!names.includes(n)) || !entries.includes('campaign.json')) die('CAMPAIGN_NOT_INITIALIZED_OR_CHANGED');
    if (!same(load(parent,RESERVATION),binding)) die('CAMPAIGN_RESERVATION_MISMATCH');
    const manifest=load(campaign,'campaign.json');
    const {startedAt,expiresAt,maxAttempts}=manifest;
    if (!same(manifest.binding,binding) || !Number.isSafeInteger(startedAt) || startedAt<0 ||
        expiresAt!==startedAt+HOURS*3600000 || maxAttempts!==MISSIONS.length) die('INVALID_CAMPAIGN_MANIFEST');
    const campaignSha256=payloadDigest(manifest);
    const outcomes=[];
    let lastAt=startedAt, halted=null, attempts=0;
    for(let i=0;i<MISSIONS.length;i++){
      const c=entries.includes(claimName(i)), r=entries.includes(resultName(i));
      if(!c || halted) {
        if (c||r||entries.includes(claimName(i+1))||entries.includes(resultName(i+1))) die('ORPHAN_CAMPAIGN_RECORD');
        break;
      }
      const claim=load(campaign,claimName(i));
      if (!same(claim,{campaignSha256,attempt:i+1,mission:MISSIONS[i],at:claim.at}) ||
          !Number.isSafeInteger(claim.at)||claim.at<lastAt||claim.at>=expiresAt) die('INVALID_CAMPAIGN_CLAIM');
      lastAt=claim.at;
      attempts++;
      if(!r) { halted='HALTED_UNKNOWN_NO_RETRY'; continue; }
      const end=load(campaign,resultName(i));
      if (end.claimSha256!==payloadDigest(claim)) die('INVALID_CAMPAIGN_RESULT');
      if (end.status==='CASE_VERIFIED' && validHash(end.digest) && same(end,{status:end.status,claimSha256:end.claimSha256,digest:end.digest}))
        outcomes.push(end.digest);
      else if (['HALTED_FAILURE_NO_RETRY','HALTED_UNKNOWN_NO_RETRY'].includes(end.status) &&
               same(end,{status:end.status,claimSha256:end.claimSha256})) halted=end.status;
      else die('INVALID_CAMPAIGN_RESULT');
    }
    return {expiresAt,campaignSha256,outcomes,lastAt,halted,attempts};
  }
  function step(dispatch) {
    const j=journal();
    const meta={attempts:j.attempts,maxAttempts:MISSIONS.length,expiresAt:j.expiresAt,verifiedCases:j.outcomes.length};
    if(j.halted) return report(j.halted,meta);
    const t=time();
    if(t<j.lastAt) return report('HALTED_CLOCK_ROLLBACK',meta);
    if(j.attempts<MISSIONS.length && t>=j.expiresAt) return report('EXPIRED',meta);
    const rd=native();
    const before=checked(rd);
    if(before.outcomes.length!==j.outcomes.length || !before.outcomes.every((o,i)=>goodOutcome(o,MISSIONS[i])&&o.digest===j.outcomes[i]))
      return report('HALTED_UNEXPECTED_NATIVE_STATE',meta);
    if(j.attempts===MISSIONS.length)
      return report(before.status==='COMPLETE'?'COMPLETE_REVIEW_ONLY':'HALTED_UNEXPECTED_NATIVE_STATE',meta);
    const i=j.attempts, mission=MISSIONS[i];
    if(before.status!=='READY'||before.mission!==mission) return report('HALTED_UNEXPECTED_NATIVE_STATE',meta);
    if(!dispatch) return report('READY',{...meta,mission});
    current();
    const at=time();
    if(at<t) return report('HALTED_CLOCK_ROLLBACK',meta);
    if(at>=j.expiresAt) return report('EXPIRED',meta);
    const claim={campaignSha256:j.campaignSha256,attempt:i+1,mission,at};
    try {save(campaign,claimName(i),claim);}
    catch(e){if(e.code==='EEXIST') return report('HALTED_UNKNOWN_NO_RETRY',meta); throw e;}
    let detail={status:'HALTED_UNKNOWN_NO_RETRY',claimSha256:payloadDigest(claim)};
    try {
      const run=rd.run();
      const after=checked(rd);
      if(after.outcomes.length===i+1 && j.outcomes.every((d,k)=>goodOutcome(after.outcomes[k],MISSIONS[k])&&after.outcomes[k].digest===d)){
        const entry=after.outcomes[i];
        if(allSafe(run) && run.workerRunsThisInvocation===1 && run.status===entry?.status && run.digest===entry.digest &&
           run.evidence?.binding?.mission===mission && entry.mission===mission && validHash(entry.digest)){
          if (goodOutcome(entry,mission) &&
              (i===MISSIONS.length-1 ? after.status==='COMPLETE' : after.status==='READY'&&after.mission===MISSIONS[i+1]))
            detail={...detail,status:'CASE_VERIFIED',digest:entry.digest};
          else if (['TRUNCATED_REFUSED','NO_MATCH','AMBIGUOUS_REFUSED','BENCHMARK_FAILED'].includes(entry.status))
            detail={...detail,status:'HALTED_FAILURE_NO_RETRY'};
        }
      }
    } catch { /* Unknown includes errors after dispatch or before independent verification. */ }
    current();
    save(campaign,resultName(i),detail);
    return report(detail.status,{...meta,attempts:i+1,mission,verifiedCases:i+(detail.status==='CASE_VERIFIED'?1:0),
      ...(detail.digest ? {reviewDigest:detail.digest,regressionPassed:8,freshPassed:16} : {})});
  }
  return {init,inspect:()=>step(false),tick:()=>step(true)};
}

if (require.main===module) {
  try {
    const [op,campaign,workspace,masterPath,...extra]=process.argv.slice(2);
    if (Number(process.versions.node.split('.')[0])<24) die('NODE24_REQUIRED');
    if (!['init','inspect','tick'].includes(op)||!campaign||!workspace||!masterPath||extra.length)
      die('USAGE_INIT_INSPECT_OR_TICK_CAMPAIGN_WORKSPACE_MASTER');
    const result=createNightly({campaign,workspace,masterPath})[op]();
    process.stdout.write(JSON.stringify(result)+'\n');
    if (result.status.startsWith('HALTED')) process.exitCode=2;
  } catch { process.stdout.write(JSON.stringify(report('BLOCKED_CONFIGURATION_OR_STATE'))+'\n'); process.exitCode=2; }
}
module.exports={createNightly};
