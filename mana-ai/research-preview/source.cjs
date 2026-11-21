'use strict';
const {createHash}=require('node:crypto');
const SYMBOL='math.fma',VERSION='3.13',FIELDS=['x','y','z'],MAX=10000;
const officialOrigin='https://docs.python.org';
const TASK='python-math-fma-exact-small-integer-projection';
const LIMITATIONS='Exact nonnegative integer subset only. No floating-point, rounding, signed zero, NaN, infinity, exceptions, or Python parity claimed.';
const hash=x=>createHash('sha256').update(x).digest('hex'),digest=x=>hash(JSON.stringify(x));
const need=(ok,msg)=>{if(!ok)throw Error(msg);};
const str=(s,n)=>typeof s==='string'&&s.length>0&&Buffer.byteLength(s)<=n&&!s.includes('\0');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function plan(){
 return {schema:'MANA_RESEARCH_NATIVE_SOURCE_PLAN_V1',task:TASK,question:'What operation does the Python 3.13 math.fma documentation define for x, y and z?',query:'Python 3.13 math.fma documentation',allowedOfficialOrigin:officialOrigin,documentationVersion:VERSION};
}
function mathGrammar(expression) {
 const safe=expression.replace(/\s+/g,'').replace(/×/g,'*').replace(/−/g,'-');
 need(/^[xyz0-4()+*\-]{1,80}$/.test(safe),'unsupported source relation tokens');
 let pos=0,budget=40;
 const limit=()=>{need(--budget>=0,'source relation budget exceeded');};
 const term=()=>{limit();const c=safe[pos++];
  if(c==='('){const f=sum();need(safe[pos++]===')','unbalanced source relation');return f;}
  if(FIELDS.includes(c))return row=>row[FIELDS.indexOf(c)];
  if(c&&/^[0-4]$/.test(c))return ()=>Number(c);
  throw Error('expected documented operand');
 };
 const product=()=>{let f=term();while(safe[pos]==='*'){pos++;const l=f,r=term();f=row=>l(row)*r(row);}return f;};
 const sum=()=>{let f=product();while(safe[pos]==='+'||safe[pos]==='-'){const op=safe[pos++],l=f,r=product();f=row=>op==='+'?l(row)+r(row):l(row)-r(row);}return f;};
 const f=sum();need(pos===safe.length,'trailing source relation syntax');return f;
}
function stripRenderer(s) {
 return s.replace(/^\s*L\d+:\s*/,'').replace(/【\d{1,8}†([^【】]{1,200})】/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/\*\*([A-Za-z.]+)\*\*/g,'$1');
}
function derive(capture) {
 need(object(capture)&&str(capture.url,1024)&&str(capture.title,1024)&&str(capture.retrievedAt,64)&&/^\d{4}-\d\d-\d\dT/.test(capture.retrievedAt)&&Number.isFinite(Date.parse(capture.retrievedAt)),'invalid source capture metadata');
 const u=new URL(capture.url);
 need(u.origin===officialOrigin&&!u.username&&!u.password&&!u.search&&u.pathname==='/'+VERSION+'/library/math.html'&&(!u.hash||u.hash==='#'+SYMBOL),'official source/version mismatch');
 need(Array.isArray(capture.passages)&&capture.passages.length>=1&&capture.passages.length<=128,'invalid bounded passages');
 const ids=new Set();
 const pieces=capture.passages.map(p=>{
  need(object(p)&&str(p.id,256)&&str(p.text,16384)&&!ids.has(p.id),'invalid or duplicate source passage');
  ids.add(p.id);return{id:p.id,text:p.text};
 });
 need(pieces.reduce((n,p)=>n+Buffer.byteLength(p.text),0)<=128*1024,'capture exceeds source budget');
 const document={url:u.href,title:capture.title,retrievedAt:capture.retrievedAt,passages:pieces};
 const declarations=[];
 for(let i=0;i<pieces.length;i++) {
  const lines=pieces[i].text.split(/\r?\n/);
  for(let j=0;j<lines.length;j++) {
   const line=stripRenderer(lines[j]).trim();
   if(!/^(?:#{1,6}\s+)?math\.fma\(\s*x,\s*y,\s*z\s*(?:,\s*\/\s*)?\s*\)\s*(?:¶|[#]+)?$/.test(line))continue;
   const snippet=lines.slice(j,Math.min(j+4,lines.length)).join('\n');
   const next=lines.length===j+1?pieces[i+1]:null;
   const adjoining=next&&/^(?:Return the fused multiply-add\b|Fused multiply-add operation\.)/i.test(stripRenderer(next.text).trim())?next:null;
   declarations.push({snippet,id:pieces[i].id,adjoining});
  }
 }
 need(declarations.length===1,'exactly one math.fma signature required');
 const d=declarations[0];
 const s=stripRenderer(d.snippet).split(/\r?\n/).map(stripRenderer).join(' ')+' '+(d.adjoining?stripRenderer(d.adjoining.text):'');
 const attr=[...s.matchAll(/(?:^|[.¶]\s+)Return the fused multiply-add (?:operation|of)\b[^.]{0,180}\.\s*(?:This (?:operation|function) (?:is computed|returns)|Compute)\s+as though\s+([()xyz0-4+*×−\-\s]{1,80})\s+were computed with infinite precision\b/g)];
 const variant=[...s.matchAll(/(?:^|[.¶]\s+)Fused multiply-add operation\.\s+Return\s+([()xyz0-4+*×−\-\s]{1,80}),\s*computed as though with infinite precision and range followed by a single round to the float format\./g)];
 attr.push(...variant);
 need(attr.length===1,'documented exact arithmetic relation missing or unsupported');
 const relation=attr[0][1].trim();const label=mathGrammar(relation);
 const examples=FIT.map(row=>{const value=label(row);need(Number.isSafeInteger(value)&&value>=0&&value<=1e12,'source relation outside the supported integer projection');return [row,value];});
 const training={schema:'MANA_INTEGER_EXAMPLES_V1',id:TASK,fields:FIELDS.map(id=>({id,power:0,max:MAX})),outputPower:0,examples};
 const source={schema:'MANA_RESEARCH_NATIVE_SOURCE_PROOF_V1',status:'SOURCE_RELATION_EXTRACTED',task:TASK,scope:LIMITATIONS,url:u.href,documentationVersion:VERSION,documentSha256:digest(document),passageIds:[d.id,...(d.adjoining?[d.adjoining.id]:[])],proofTextsSha256:digest([d.snippet,...(d.adjoining?[d.adjoining.text]:[])]),literalSourceRelation:relation,fitRows:examples.length,fitSha256:digest(training)};
 return {source,training};
}
// Unlabelled input anchors selected before source ingest. No output values or heldout.
const FIT=Object.freeze([[0,0,0],[1,2,3],[4,2,3],[1,7,3],[1,2,9],[0,6,3],[6,0,3],[6,2,0],[2,4,8],[3,9,2],[97,12,33],[13,2,90],[100,100,100],[81,6,50]]);
module.exports={derive,plan,TASK,FIELDS,MAX,LIMITATIONS,hash,digest,need,object};
