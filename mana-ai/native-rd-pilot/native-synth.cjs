'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const LIMIT=1e12,OPS=['add','subtract','multiply','min','max'],LITERALS=[0,1,2,3,4];
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),digest=x=>hash(JSON.stringify(x));
const plain=(x,...keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join()===keys.sort().join();
function validate(p){
 if(!plain(p,'schema','id','fields','outputPower','examples')||p.schema!=='MANA_INTEGER_EXAMPLES_V1'||!/^[-a-z0-9]{1,60}$/.test(p.id)||!Array.isArray(p.fields)||p.fields.length<2||p.fields.length>4||new Set(p.fields.map(f=>f?.id)).size!==p.fields.length||!p.fields.every(f=>plain(f,'id','power','max')&&/^[a-z][a-z0-9_]{0,39}$/.test(f.id)&&!['constructor','prototype'].includes(f.id)&&Number.isInteger(f.power)&&f.power>=0&&f.power<=3&&Number.isSafeInteger(f.max)&&f.max>=10&&f.max<=100000)||!Number.isInteger(p.outputPower)||p.outputPower<0||p.outputPower>3||!Array.isArray(p.examples)||p.examples.length<8||p.examples.length>32)throw Error('Invalid reviewed training shape');
 const keys=new Set();
 for(const [x,y,...rest]of p.examples){if(rest.length||!Array.isArray(x)||x.length!==p.fields.length||x.some((n,i)=>!Number.isSafeInteger(n)||n<0||n>p.fields[i].max)||!Number.isSafeInteger(y)||y<0||y>LIMIT||keys.has(x.join()))throw Error('Invalid training example');keys.add(x.join());}
}
function synthesize(p,{maxNodes=11,maxCombinations=2000000,maxStates=145000,maxMs=7000}={}){
 validate(p);
 if(![[maxNodes,3,11],[maxCombinations,1,2000000],[maxStates,1,145000],[maxMs,1,7000]].every(([n,a,b])=>Number.isInteger(n)&&n>=a&&n<=b)||maxNodes%2===0)throw Error('Bounds required');
 const start=performance.now(),stats={combinations:0,states:0,deduplicated:0,typedRejected:0,overflowRejected:0,maxNodesReached:1,matchedExpressions:0,matchedBehaviorClasses:0};
 const neutral=Array.from({length:8},(_,i)=>p.fields.map((f,j)=>{const k=Number.parseInt(hash('public-domain-probe-v1:'+i+':'+j).slice(0,8),16);return i<2?(i?j%2:0):k%(Math.min(f.max,25000)+1);}));
 const rows=[...p.examples.map(t=>t[0]),...neutral],expected=p.examples.map(t=>t[1]),bySize=new Map(),seen=new Map(),matches=new Map();
 let reason='NODE_LIMIT',winner=null,budget=false;
 const candidate=(power,ast,v,size)=>{
  if(power===p.outputPower&&expected.every((want,i)=>v[i]===want)){
   stats.matchedExpressions++;
   const finger=JSON.stringify(v.slice(expected.length));
   if(!matches.has(finger)){matches.set(finger,ast);stats.matchedBehaviorClasses=matches.size;}
   winner??=ast;
  }
  const key=power+';'+JSON.stringify(v);if(seen.has(key)){stats.deduplicated++;return;}
  if(stats.states>=maxStates){reason='STATE_LIMIT';budget=true;return;}
  const item={power,ast,v,ordinal:stats.states++};
  seen.set(key,item);if(!bySize.has(size))bySize.set(size,[]);bySize.get(size).push(item);
 };
 for(const [j,f]of p.fields.entries())candidate(f.power,{field:f.id},rows.map(r=>r[j]),1);
 for(const n of LITERALS)for(const power of n===0?[0,1,2,3]:[0])candidate(power,{value:n},rows.map(()=>n),1);
 const compute=(op,x,y)=>{
  if(x===null||y===null)return null;
  const n=op==='add'?x+y:op==='subtract'?x-y:op==='multiply'?x*y:op==='min'?Math.min(x,y):Math.max(x,y);
  return Number.isSafeInteger(n)&&Math.abs(n)<=LIMIT?n:null;
 };
 for(let size=3;size<=maxNodes&&!winner&&!budget;size+=2){
  stats.maxNodesReached=size;
  outer:for(let a=1;a<size-1;a+=2)for(const x of bySize.get(a)||[])for(const y of bySize.get(size-1-a)||[])for(const op of OPS){
   if(stats.combinations>=maxCombinations){reason='COMBINATION_LIMIT';budget=true;break outer;}
   if((stats.combinations&255)===0&&performance.now()-start>=maxMs){reason='TIME_LIMIT';budget=true;break outer;}
   stats.combinations++;
   if(op!=='subtract'&&x.ordinal>y.ordinal)continue;
   const power=op==='multiply'?x.power+y.power:x.power;
   if(power>3||op!=='multiply'&&x.power!==y.power){stats.typedRejected++;continue;}
   const v=x.v.map((n,i)=>compute(op,n,y.v[i]));
   if(v.slice(0,expected.length).includes(null)){stats.overflowRejected++;continue;}
   candidate(power,{op,args:[x.ast,y.ast]},v,size);
   if(budget)break outer;
  }
 }
 if(winner&&!budget)reason='FIRST_MATCH_SIZE_FINISHED';
 return {schema:'MANA_NATIVE_SYNTHESIS_RESULT_V1',status:winner?'FROZEN_FOR_INDEPENDENT_TESTS':budget?'SEARCH_TRUNCATED':'NO_MATCH_WITHIN_NODE_LIMIT',task:p.id,fields:p.fields,outputPower:p.outputPower,trainingExampleCount:p.examples.length,trainingSha256:digest(p),candidate:winner,candidateSha256:winner?digest(winner):null,search:{...stats,reason,truncated:budget,maxNodes,maxCombinations,maxStates,maxMs,elapsedMs:Math.round(performance.now()-start),behaviorPruning:'training-and-unlabelled-fingerprints; incomplete beyond observed vectors',ambiguity:matches.size>1?'OBSERVED_DIFFERENT_BEHAVIORS':'NO_DIFFERENCE_OBSERVED_NOT_UNIQUENESS'},modelCalls:0,activationAuthorized:false,modelTrainingPerformed:false};
}
function main(){
 const [training,expected,result,...extra]=process.argv.slice(2);
 if(extra.length||![training,result].every(x=>typeof x==='string'&&path.isAbsolute(x))||!/^[a-f0-9]{64}$/.test(expected||''))throw Error('Usage: node native-synth.cjs /absolute/training.json <reviewed-file-sha256> /absolute/frozen-result.json');
 const opened=fs.openSync(training,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);let b;
 try{const st=fs.fstatSync(opened);if(!st.isFile()||st.size<1||st.size>32768)throw Error('Bounded training file required');b=fs.readFileSync(opened);}finally{fs.closeSync(opened);}
 if(hash(b)!==expected)throw Error('Training provenance mismatch');
 const r={...synthesize(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b))),trainingFileSha256:expected,workerSha256:hash(fs.readFileSync(__filename))};
 const fd=fs.openSync(result,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(r,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 const dir=fs.openSync(path.dirname(result),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
 console.log(JSON.stringify({status:r.status,task:r.task,candidateSha256:r.candidateSha256,search:r.search}));
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={synthesize,digest};
