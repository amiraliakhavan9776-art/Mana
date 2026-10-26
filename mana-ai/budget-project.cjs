'use strict';
// Offline local operator calculations; not an independently certified company baseline.
const path=require('node:path');
const {parseExactJSON}=require('./src/exact-json.cjs');
const {readRegular}=require('./src/native/skill-evolution.cjs');
const {scheduleProject}=require('./src/native/resource-scheduler.cjs');
const {createProjectMonitor}=require('./src/native/project-monitor.cjs');
const {createProjectRecoveryPlanner}=require('./src/native/project-recovery.cjs');
const {createRecoveryScenarioComparator}=require('./src/native/recovery-scenarios.cjs');
const {createScenarioBudget}=require('./src/native/scenario-budget.cjs');
const {createBudgetRange}=require('./src/native/budget-range.cjs');
try{
 const [file,flag]=process.argv.slice(2),rangeMode=flag==='--range';if(process.argv.length<3||process.argv.length>4||!path.isAbsolute(file)||(flag!==undefined&&!rangeMode))throw Error('Absolute input and optional --range required');
 const allowed=['tasks','capacities','observations','weights','asOf','maxAge','delayToleranceBps','horizon','scenarios','timeUnit','rateCard','budget',...(rangeMode?['upperRateCard']:[])];
 const data=parseExactJSON(readRegular(file,128000));if(!data||Object.keys(data).some(k=>!allowed.includes(k)))throw Error('Invalid budget input');
 const principal={id:'local-operator',orgId:'local',role:'analyst',projectIds:['local'],capabilityIds:['native.schedule.propose','native.project.monitor','native.project.replan','native.recovery.scenarios','native.recovery.budget','native.recovery.budget.range']},project={id:'local',orgId:'local'};
 const schedule=scheduleProject({principal,project,tasks:data.tasks,capacities:data.capacities,...(data.horizon===undefined?{}:{horizon:data.horizon})});
 const monitor=createProjectMonitor({authorize:()=>true,verifyBaseline:()=>true,verifyObservation:()=>true}),planner=createProjectRecoveryPlanner({monitor,authorize:()=>true,verifyEstimates:()=>true}),comparator=createRecoveryScenarioComparator({planner,authorize:()=>true}),budgeting=createScenarioBudget({comparator,authorize:()=>true,verifyRates:()=>true});
 const input={schedule,observations:data.observations,weights:data.weights,asOf:data.asOf};for(const k of ['maxAge','delayToleranceBps','horizon'])if(data[k]!==undefined)input[k]=data[k];
 const common={principal,project,input,scenarios:data.scenarios,timeUnit:data.timeUnit,budget:data.budget};
 const result=rangeMode?createBudgetRange({budgeting,authorize:()=>true,verifyBounds:()=>true}).analyze({...common,lowerRateCard:data.rateCard,upperRateCard:data.upperRateCard}):budgeting.compare({...common,rateCard:data.rateCard});
 console.log(JSON.stringify({...result,evidenceAuthority:'Explicit local operator input only; independent company evidence and rate verification are not established.'},null,2));
}catch{console.error('Project budget comparison refused; check explicit estimates, scoped observations, rates, currency, units and rounding.');process.exitCode=1;}
