'use strict';
// Mana Business Autopilot pilot: deterministic, offline, no external API or data egress.
// Produces a reviewable proposal, never performs actions or provisions agents.
const SECTORS = {
  construction: {
    keywords: ['construction','architecture','building','ساختمان','معماری','عمران','پیمانکاری'],
    workflows: ['Project intake and feasibility','Design phases 0/1/2','Site reporting and evidence verification','Progress claims and change orders','Quantity takeoff and procurement','Cashflow and profitability'],
    agents: ['Project strategist','Technical office','Site operations','Finance and claims','Design and CAD','Procurement']
  },
  retail: {
    keywords: ['retail','shop','store','فروشگاه','مغازه','خرده فروشی'],
    workflows: ['Catalog and pricing','Inventory reconciliation','Sales and customer service','Purchasing and supplier scoring','Cashflow and margins','Marketing campaigns'],
    agents: ['Sales operations','Inventory','Finance','Purchasing','Marketing']
  },
  clinic: {
    keywords: ['clinic','medical','healthcare','کلینیک','مطب','درمانگاه'],
    workflows: ['Appointment scheduling','Consent and records governance','Administrative intake','Inventory and equipment','Billing and reconciliation','Quality and compliance'],
    agents: ['Scheduling','Administration','Finance','Compliance']
  }
};
const COMMON = ['Strategy and KPIs','R&D and improvement','Brand identity','Financial controls','Role-based access and audit'];
function str(value,label,max=180) {
  if(typeof value!=='string'||!value.trim()||value.length>max) throw Error('Invalid '+label);
  return value.trim();
}
function blueprint(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)) throw Error('Input object required');
  const profession=str(input.profession,'profession');
  const organization=str(input.organization,'organization');
  const goals=Array.isArray(input.goals)?input.goals.map((g)=>str(g,'goal')):[];
  if(goals.length>20) throw Error('Too many goals');
  const normalized=profession.toLocaleLowerCase('fa');
  const matched=Object.entries(SECTORS).find(([,v])=>v.keywords.some(k=>normalized.includes(k)));
  const sector=matched?.[0]||'general';
  const data=matched?.[1]||{workflows:['Service delivery','Customer management','Operations planning','Resource management','Reporting and compliance'],agents:['Operations','Finance','Strategy','Branding']};
  return {
    status:'PROPOSAL_REQUIRES_HUMAN_REVIEW',
    organization,profession,sector,goals,
    workflows:[...data.workflows,...COMMON],
    proposedAgents:data.agents.map(name=>({name,enabled:false,permissions:[],actionsExecuted:0})),
    onboardingQuestions:[
      'Which country and regulatory jurisdiction apply?',
      'How many employees and locations are involved?',
      'Which existing software and data sources may be connected?',
      'Which actions may Mana execute without approval?',
      'What is the top priority and measurable success criterion?'
    ],
    governance:{autonomousExecution:false,externalDataTransfer:false,requiresApproval:['financial postings','contract commitments','regulated decisions','production code deployment','safety-critical changes'],dataIsolation:'organization and role scoped'},
    note:'Offline blueprint only. No accounts, departments, agents or workflows were actually created.'
  };
}
module.exports={blueprint};
if(require.main===module) {
  const fs=require('node:fs');
  try {
    if(process.argv.length!==3) throw Error('Usage: node business-autopilot.cjs input.json');
    console.log(JSON.stringify(blueprint(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));
  } catch(e){console.error(e.message);process.exitCode=1;}
}
