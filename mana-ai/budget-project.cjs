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
const {createRecoveryCashflow}=require('./src/native/recovery-cashflow.cjs');
try{
 const [file,flag]=process.argv.slice(2),rangeMode=flag==='--range',cashMode=flag==='--cashflow';if(process.argv.length<3||process.argv.length>4||!path.isAbsolute(file)||(flag!==undefined&&!rangeMode&&!cashMode))throw Error('Absolute input and optional --range or --cashflow required');
 const allowed=['tasks','capacities','observations','weights','asOf','maxAge','delayToleranceBps','horizon','scenarios','timeUnit','rateCard','budget',...(rangeMode?['upperRateCard']:[]),...(cashMode?['cashflow']:[])];
 const data=parseExactJSON(readRegular(file,128000));if(!data||Object.keys(data).some(k=>!allowed.includes(k)))throw Error('Invalid budget input');
 const principal={id:'local-operator',orgId:'local',role:'analyst',projectIds:['local'],capabilityIds:['native.schedule.propose','native.project.monitor','native.project.replan','native.recovery.scenarios','native.recovery.budget','native.recovery.budget.range','native.recovery.cashflow']},project={id:'local',orgId:'local'};
 const schedule=scheduleProject({principal,project,tasks:data.tasks,capacities:data.capacities,...(data.horizon===undefined?{}:{horizon:data.horizon})});
 const monitor=createProjectMonitor({authorize:()=>true,verifyBaseline:()=>true,verifyObservation:()=>true}),planner=createProjectRecoveryPlanner({monitor,authorize:()=>true,verifyEstimates:()=>true}),comparator=createRecoveryScenarioComparator({planner,authorize:()=>true}),budgeting=createScenarioBudget({comparator,authorize:()=>true,verifyRates:()=>true});
 const input={schedule,observations:data.observations,weights:data.weights,asOf:data.asOf};for(const k of ['maxAge','delayToleranceBps','horizon'])if(data[k]!==undefined)input[k]=data[k];
 const common={principal,project,input,scenarios:data.scenarios,timeUnit:data.timeUnit,budget:data.budget};
 let result;
 if(cashMode){
  if(!data.cashflow||Object.keys(data.cashflow).sort().join(',')!=='allocationPolicy,funding,openingCash,scenarioId')throw Error('Explicit cashflow inputs required');
  const scenario=data.scenarios.find(s=>s.id===data.cashflow.scenarioId);if(!scenario||!Object.hasOwn(data.rateCard.fixedCosts,scenario.id))throw Error('Explicit cashflow scenario required');
  const rateCard={...data.rateCard,fixedCosts:{[scenario.id]:data.rateCard.fixedCosts[scenario.id]}};
  result=createRecoveryCashflow({planner,budgeting,authorize:()=>true,verifyFunding:()=>true}).analyze({principal,project,input,scenario,rateCard,budget:data.budget,timeUnit:data.timeUnit,openingCash:data.cashflow.openingCash,funding:data.cashflow.funding,allocationPolicy:data.cashflow.allocationPolicy});
 }else if(rangeMode)result=createBudgetRange({budgeting,authorize:()=>true,verifyBounds:()=>true}).analyze({...common,lowerRateCard:data.rateCard,upperRateCard:data.upperRateCard});
 else result=budgeting.compare({...common,rateCard:data.rateCard});
 console.log(JSON.stringify({...result,evidenceAuthority:'Explicit local operator input only; independent company evidence, rate and funding verification are not established.'},null,2));
}catch{console.error('Project budget comparison refused; check explicit estimates, scoped observations, rates, currency, units and rounding.');process.exitCode=1;}
