'use strict';
// Local operator proposal only; no project data discovery, reservation or execution.
const path=require('node:path');
const {parseExactJSON}=require('./src/exact-json.cjs');
const {readRegular}=require('./src/native/skill-evolution.cjs');
const {scheduleProject}=require('./src/native/resource-scheduler.cjs');
try{const [file]=process.argv.slice(2);if(process.argv.length!==3||!path.isAbsolute(file))throw Error('Absolute schedule input required');const data=parseExactJSON(readRegular(file,128000));if(!data||Object.keys(data).some(key=>!['tasks','capacities','horizon'].includes(key)))throw Error('Invalid input');const project={id:'local',orgId:'local'},principal={id:'local-operator',orgId:'local',role:'analyst',projectIds:['local'],capabilityIds:['native.schedule.propose']};console.log(JSON.stringify(scheduleProject({...data,principal,project}),null,2));}catch{console.error('Schedule proposal refused; check explicit dependencies, estimates and resource bounds.');process.exitCode=1;}
