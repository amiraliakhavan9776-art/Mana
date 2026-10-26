'use strict';
// Explicit local operator analysis only. No remote authority or live changes.
const path=require('node:path');
const {parseExactJSON}=require('./src/exact-json.cjs');
const {readRegular}=require('./src/native/skill-evolution.cjs');
const {createScheduleSensitivity}=require('./src/native/schedule-sensitivity.cjs');
try{
 const [file]=process.argv.slice(2);if(process.argv.length!==3||!path.isAbsolute(file))throw Error('Absolute input required');
 const data=parseExactJSON(readRegular(file,128000));if(!data||Object.keys(data).some(k=>!['tasks','capacities','horizon','taskIds','delayUnits'].includes(k)))throw Error('Invalid analysis input');
 const principal={id:'local-operator',orgId:'local',role:'analyst',projectIds:['local'],capabilityIds:['native.schedule.propose','native.schedule.analyze']},project={id:'local',orgId:'local'};
 const analyzer=createScheduleSensitivity({authorize:()=>true,verifyInputs:()=>true});
 console.log(JSON.stringify({...analyzer.analyze({...data,principal,project}),evidenceAuthority:'Explicit local operator input only; independent company evidence verification is not established.'},null,2));
}catch{console.error('Schedule analysis refused; check explicit tasks, capacities, delay and selected task identifiers.');process.exitCode=1;}
