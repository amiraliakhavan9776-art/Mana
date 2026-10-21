'use strict';
// Mana Autopilot controlled execution pilot: offline, in-memory, draft-only.
// No financial posting, network I/O, filesystem writes, CAD changes or external actions.
const {TASKS}=require('./autopilot-orchestrator.cjs');
const SAFE=new Set(['strategy_brief','brand_brief','operations_plan','finance_review']);
function createDraftExecutor({audit=()=>{}}={}){
  if(typeof audit!=='function') throw Error('Invalid audit');
  const completed=new Set();
  return {
    execute({plan,taskId,principal,approval=false}){
      if(!plan||plan.status!=='DRAFT_NOT_EXECUTED'||!Array.isArray(plan.proposal?.tasks)) throw Error('Invalid plan');
      if(typeof principal?.id!=='string'||!principal.id||!Array.isArray(principal.permissions)||!principal.permissions.includes('autopilot:draft')) throw Error('Permission denied');
      const task=plan.proposal.tasks.find(t=>t.id===taskId);
      if(!task||!Object.hasOwn(TASKS,task.kind)||task.title!==TASKS[task.kind].title||task.status!=='proposed'||task.executed!==false) throw Error('Invalid task');
      if(!SAFE.has(task.kind)) throw Error('Task requires specialist workflow and cannot execute here');
      if(approval!==true) throw Error('Explicit draft approval required');
      const key=principal.id+'|'+plan.baseline.organization+'|'+task.id+'|'+task.kind;
      if(completed.has(key)) throw Error('Task already executed in this session');
      const title=TASKS[task.kind].title;
      const body=[
        '# '+title,
        'Organization: '+plan.baseline.organization,
        'Profession: '+plan.baseline.profession,
        'Goals: '+(plan.baseline.goals.join('; ')||'Not provided'),
        'Purpose: '+task.reason,
        'Draft checklist:',
        '- Validate organization profile and jurisdiction',
        '- Obtain authorized source documents and evidence',
        '- Identify assumptions, risks, owners and deadlines',
        '- Review findings with an authorized professional',
        'Status: DRAFT ONLY; no external action or decision was performed.'
      ].join('\n');
      audit({event:'autopilot.draft_created',actorId:principal.id,organization:plan.baseline.organization,taskId,kind:task.kind});
      completed.add(key);
      return {taskId,kind:task.kind,status:'DRAFT_CREATED',content:body,externalActions:0};
    }
  };
}
module.exports={createDraftExecutor};
