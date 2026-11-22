'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {checkArming,runArmedTick,exactBytes}=require('../ops/rd-nightly-stage-v1/armed-v1.cjs');

const dir=path.join(__dirname,'../ops/rd-nightly-stage-v1');
test('only add an isolated fixed tick, no timer, init, install target, restart, or strict legacy dependency',()=>{
  const service=fs.readFileSync(path.join(dir,'mana-rd-pilot.service'),'utf8');
  for(const line of ['Type=oneshot','User=mana-rd-pilot','Group=mana-rd-pilot','Restart=no',
    'ConditionPathExists=/etc/mana-rd-pilot/armed-v1','StateDirectory=mana-rd-pilot','StateDirectoryMode=0700',
    'PrivateNetwork=yes','RestrictAddressFamilies=none','ProtectSystem=strict','ProtectHome=yes','NoNewPrivileges=yes'])
    assert.ok(service.split('\n').includes(line),line);
  const exec=service.split('\n').filter(line=>line.startsWith('Exec'));
  assert.deepEqual(exec,[
    'ExecStart=/opt/mana-rd-pilot/v1/node/bin/node /opt/mana-rd-pilot/v1/mana-ai/ops/rd-nightly-stage-v1/armed-v1.cjs'
  ]);
  assert.doesNotMatch(service,/\[Install\]|\.timer|ReadWritePaths=|PrivateTmp=yes/);
  const drop=fs.readFileSync(path.join(dir,'90-mana-rd-pilot.conf.example'),'utf8');
  assert.equal(drop.split('\n').filter(line=>line&&!line.startsWith('#')).join('\n'),
    '[Unit]\nWants=mana-rd-pilot.service');
});

test('arm token binds exact manifest and permits only the engine verified read-only READY',()=>{
  const args={armPath:'/etc/mana-rd-pilot/armed-v1',campaign:'/private/campaign',
    workspace:'/private/native',masterPath:'/private2/master.txt'};
  const manifest=Buffer.from('one real manifest\n');
  const arm=Buffer.from('MANA_RD_PILOT_ARM_V1 '+createHash('sha256').update(manifest).digest('hex')+'\n');
  let armChecks=0,inspections=0;
  const statDirectory=p=>{
    assert.equal(p,'/etc/mana-rd-pilot');
    return {uid:0,gid:777,mode:0o40750,isDirectory:()=>true};
  };
  const readBytes=(p,opts)=>{
    if(p==='/private/campaign/campaign.json'){
      assert.deepEqual(opts,{owner:666,mode:0o600,limit:4096});
      return manifest;
    }
    assert.equal(p,args.armPath);
    assert.deepEqual(opts,{owner:0,group:777,mode:0o440,limit:128});
    armChecks++;
    return arm;
  };
  const ready={status:'READY',modelCalls:0,activationAuthorized:false,productionAllowed:false,modelTrainingPerformed:false};
  const openNightly=o=>{
    assert.deepEqual(o,{campaign:args.campaign,workspace:args.workspace,masterPath:args.masterPath});
    return {inspect(){inspections++;return ready;},run(){assert.fail('preflight may not dispatch');}};
  };
  const policy={serviceUid:666,serviceGid:777,statDirectory,readBytes,openNightly};
  assert.equal(checkArming(args,policy),true);
  assert.equal(armChecks,2);
  assert.equal(inspections,1);
  assert.throws(()=>checkArming(args,{...policy,serviceUid:0}),/NOT_ARMED/);
  assert.throws(()=>checkArming(args,{...policy,statDirectory:p=>({...statDirectory(p),uid:666})}),/NOT_ARMED/);
  assert.throws(()=>checkArming(args,{...policy,readBytes:(p,o)=>p===args.armPath?Buffer.from('wrong'):readBytes(p,o)}),/NOT_ARMED/);
  assert.equal(inspections,1);
  for(const change of [{status:'COMPLETE_REVIEW_ONLY'},{status:'HALTED_UNKNOWN_NO_RETRY'},{activationAuthorized:true}]){
    assert.throws(()=>checkArming(args,{...policy,openNightly:()=>({inspect:()=>({...ready,...change})})}),/NOT_ARMED/);
  }
  let first=true;
  assert.throws(()=>checkArming(args,{...policy,readBytes:(p,o)=>{
    if(p===args.armPath){if(!first)return Buffer.from('disarmed');first=false;}
    return readBytes(p,o);
  }}),/NOT_ARMED/);
  let firstManifest=true;
  assert.throws(()=>checkArming(args,{...policy,readBytes:(p,o)=>{
    if(p.endsWith('/campaign.json')){
      if(!firstManifest)return Buffer.from('changed');
      firstManifest=false;
    }
    return readBytes(p,o);
  }}),/NOT_ARMED/);
});

test('actual bounded reader rejects wrong ownership/mode, symlinks, hardlinks, and oversized files',t=>{
  const d=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mana-arm-test-')));
  t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
  const arm=path.join(d,'actual'),linked=path.join(d,'linked');
  fs.writeFileSync(arm,'approved\n',{mode:0o440});
  const uid=process.geteuid(),gid=process.getegid();
  const opts={owner:uid,group:gid,mode:0o440,limit:128};
  assert.equal(exactBytes(arm,opts).toString(),'approved\n');
  for(const change of [{owner:uid+1},{group:gid+1},{mode:0o444},{limit:1}])
    assert.throws(()=>exactBytes(arm,{...opts,...change}),/NOT_ARMED/);
  fs.symlinkSync(arm,linked);
  assert.throws(()=>exactBytes(linked,opts),/NOT_ARMED/);
  fs.unlinkSync(linked);
  fs.linkSync(arm,linked);
  assert.throws(()=>exactBytes(arm,opts),/NOT_ARMED/);
});

const {createNightly}=require('../run-rd-nightly-tick.cjs');
test('revocation or manifest drift at last admission consumes one claim but dispatches zero native runs',t=>{
  for(const change of ['revoked','drift']){
    const parent=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mana-arm-race-')));
    t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));
    const state=path.join(parent,'state');
    const config={campaign:path.join(state,'campaign'),workspace:path.join(state,'native'),masterPath:path.join(parent,'master.txt'),armPath:path.join(parent,'arm')};
    for(const dir of [state,config.campaign,config.workspace]) fs.mkdirSync(dir,{mode:0o700});
    let runs=0;
    const ready={status:'READY',modelCalls:0,activationAuthorized:false,productionAllowed:false,modelTrainingPerformed:false,
      outcomes:[],mission:'net-finish-length-mm'};
    const factory=()=>({inspect:()=>ready,run:()=>{runs++;throw Error('must not dispatch');}});
    createNightly({...config,nativeFactory:factory}).init();
    const manifestPath=path.join(config.campaign,'campaign.json'),claimPath=path.join(config.campaign,'attempt-1.claim.json');
    const expected=Buffer.from('MANA_RD_PILOT_ARM_V1 '+createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex')+'\n');
    const deps={serviceUid:666,serviceGid:777,nativeFactory:factory,
      openNightly:options=>createNightly({...options,nativeFactory:options.nativeFactory??factory}),
      statDirectory:()=>({uid:0,gid:777,mode:0o40750,isDirectory:()=>true}),
      readBytes(p){
        const inFlight=fs.existsSync(claimPath);
        if(p===config.armPath) return inFlight&&change==='revoked'?Buffer.from('revoked'):expected;
        return inFlight&&change==='drift'?Buffer.from('version drift'):fs.readFileSync(p);
      }};
    assert.equal(runArmedTick(config,deps).status,'HALTED_UNKNOWN_NO_RETRY');
    assert.equal(runs,0);
    assert.ok(fs.existsSync(claimPath));
    assert.throws(()=>runArmedTick(config,{...deps,readBytes:p=>p===config.armPath?expected:fs.readFileSync(p)}),/NOT_ARMED/);
    assert.equal(runs,0);
  }
});

test('armed wrapper delegates one real native case without enabling or publishing it',{
  skip:!process.env.MANA_TEST_MASTER||Number(process.versions.node.split('.')[0])<24
},t=>{
  const parent=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mana-arm-real-')));
  t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));
  const state=path.join(parent,'state');
  const config={campaign:path.join(state,'campaign'),workspace:path.join(state,'native'),
    masterPath:process.env.MANA_TEST_MASTER,armPath:path.join(parent,'arm')};
  for(const dir of [state,config.campaign,config.workspace]) fs.mkdirSync(dir,{mode:0o700});
  createNightly(config).init();
  const digest=createHash('sha256').update(fs.readFileSync(path.join(config.campaign,'campaign.json'))).digest('hex');
  const r=runArmedTick(config,{serviceUid:666,serviceGid:777,
    statDirectory:()=>({uid:0,gid:777,mode:0o40750,isDirectory:()=>true}),
    readBytes:p=>p===config.armPath?Buffer.from('MANA_RD_PILOT_ARM_V1 '+digest+'\n'):fs.readFileSync(p)});
  assert.equal(r.status,'CASE_VERIFIED');
  assert.equal(r.regressionPassed+r.freshPassed,24);
  assert.equal(r.modelCalls,0);
  assert.equal(r.activationAuthorized,false);
  assert.equal(createNightly(config).inspect().mission,'uniform-layer-volume-mm3');
});
