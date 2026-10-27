'use strict';
const {createNativeCore}=require('./src/native/core.cjs');
function demo(){
 const principal={id:'demo-user',orgId:'demo-org',role:'analyst',projectIds:['demo-project'],capabilityIds:['inspect','draft','shortcut']};
 const project={id:'demo-project',orgId:'demo-org'};
 const row=(id,key,value)=>({id,orgId:project.orgId,projectId:project.id,key,value,source:'synthetic-demo-only',verification:'verified'});
 const core=createNativeCore({capabilities:[
  {id:'inspect',title:'بررسی منابع',requires:['source_available'],produces:['sources_reviewed'],workUnits:2,risk:'read'},
  {id:'draft',title:'تهیه پیش‌نویس گزارش',requires:['sources_reviewed'],produces:['draft_ready'],workUnits:3,risk:'draft'},
  {id:'shortcut',title:'مسیر جایگزین پرهزینه',requires:['source_available'],produces:['draft_ready'],workUnits:9,risk:'draft'}
 ]});
 const planning=core.plan({principal,project,objective:'برنامهٔ تهیه گزارش بر پایه شواهد',goals:['draft_ready'],evidence:[row('source1','source_available',true)],maxWorkUnits:6});
 const decision=core.evaluate({principal,project,
  criteria:[{id:'cost',weight:40,direction:'minimize',min:0,max:100},{id:'quality',weight:60,direction:'maximize',min:0,max:10,requiredMin:5}],
  alternatives:[{id:'a',label:'کم‌هزینه با کیفیت نامعتبر',assessments:[{criterionId:'cost',value:10,evidenceIds:['ac']},{criterionId:'quality',value:2,evidenceIds:['aq']}]},{id:'b',label:'گزینهٔ قابل بررسی',assessments:[{criterionId:'cost',value:40,evidenceIds:['bc']},{criterionId:'quality',value:8,evidenceIds:['bq']}]}],
  evidence:[row('ac','a:cost',10),row('aq','a:quality',2),row('bc','b:cost',40),row('bq','b:quality',8)]});
 return {demo:'MANA native planning/evaluation module v0.1',synthetic:true,inferenceRequired:false,planning,decision};
}
if(require.main===module)process.stdout.write(JSON.stringify(demo(),null,2)+'\n');
module.exports={demo};
