'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{EventEmitter}=require('node:events'),{createHash}=require('node:crypto');
const {diagnoseNasaLayout}=require('./nasa-area-layout-diagnostic.cjs');
const {INDEX_URL,AREA_URL}=require('./nasa-area-source.cjs');
const python=process.env.MANA_NASA_PYTHON??'/usr/bin/python3';
const hasPython=spawnSync(python,['--version'],{timeout:1000}).status===0;
const index=href=>'<html><head><title>Index of Aerodynamics Slides</title></head><body><img alt="Label for Math Fundamentals"><a href="'+href+'">Area</a></body></html>';
const formula='The equation for the area of a trapezoid is one half the sum of the top t and bottom b times the height h; A = h * [ t + b ] / 2 The area of a triangle is a different shape.';
const OPEN='On the slide we have listed the formula to calculate the area of a variety of shapes:';
const SENTINEL='RAW_TEXT_SHOULD_NEVER_LEAK';
const previous='Adjacent caption. This is a prior note, not dimension evidence. '+SENTINEL;
const area=(before,clause)=>'<html><head><title>Area</title></head><body><p>'+before+'</p><p>'+clause+'</p></body></html>';
function reader(calls,idx,lesson,lessonStatus=200){
 return (url,opts,onResponse)=>{
  calls.push(url);
  assert(opts.rejectUnauthorized===true&&opts.method==='GET');
  const q=new EventEmitter();q.destroy=()=>{};
  q.end=()=>setImmediate(()=>{
   const res=new EventEmitter();res.statusCode=url===INDEX_URL?200:lessonStatus;
   res.headers={'content-type':'text/html'};res.complete=true;
   onResponse(res);
   res.emit('data',Buffer.from(url===INDEX_URL?idx:lesson));
   res.emit('end');
  });return q;
 };
}
test('metadata-only follow-up distinguishes moved opening, case/punctuation-normalized matches and exact source order',{skip:!hasPython},async()=>{
 const calls=[];
 const raw=area(previous,'Section title. '+OPEN.replace('On the slide','ON THE SLIDE,')+' '+formula);
 const d=await diagnoseNasaLayout({pythonPath:python,request:reader(calls,index('area.html'),raw)});
 assert.deepEqual(calls,[INDEX_URL,AREA_URL]);
 assert.equal(d.status,'LAYOUT_SUMMARY');assert.equal(d.fault,'NASA_PLANAR_PRECEDING_EVIDENCE_MISSING');
 assert.equal(d.priorCleanParagraphCount,1);assert.equal(d.lessonTitleVerified,true);
 assert.equal(d.lessonSha256,createHash('sha256').update(raw).digest('hex'));
 const [c,p]=d.paragraphs;
 assert.equal(c.exactOpeningStarts,false);assert.equal(c.exactOpeningIncludes,false);
 assert.equal(c.normalizedOpeningIncludes,true);assert.equal(c.normalizedOpeningFirstToken,2);
 assert.equal(c.adjacent.listedToFormula,true);assert.equal(c.cues.title.firstToken,1);
 assert(c.cues.formulaSingular.closestDistanceFromReference<0);
 assert.equal(p.role,'prior-1');assert.equal(p.cues.caption.firstToken,1);
 assert(!JSON.stringify(d).includes(SENTINEL));
 assert(!JSON.stringify(d).includes(formula));
});
test('fixed lexical summaries distinguish plural opening and nonadjacent fragments',{skip:!hasPython},async()=>{
 const calls=[];
 const raw=area('Recorded title.',OPEN.replace('the formula','the formulas')+' '+formula);
 const d=await diagnoseNasaLayout({pythonPath:python,request:reader(calls,index('area.html'),raw)});
 const c=d.paragraphs[0];
 assert.equal(c.normalizedOpeningIncludes,false);assert.equal(c.normalizedPluralOpeningFirstToken,0);
 assert.equal(c.cues.formulaPlural.firstToken,7);assert.equal(c.cues.formulaSingular.firstToken,null);
 const y=await diagnoseNasaLayout({pythonPath:python,request:reader([],index('area.html'),area('Note.',OPEN.replace('listed the','listed options the')+' '+formula))});
 assert.equal(y.paragraphs[0].adjacent.listedToFormula,false);
});
test('failed link or blocked lesson cannot bypass the existing provenance gate',{skip:!hasPython},async()=>{
 const calls=[];
 const d=await diagnoseNasaLayout({pythonPath:python,request:reader(calls,index('https://example.invalid/area.html'),area(previous,OPEN+formula))});
 assert.equal(d.status,'DIAGNOSTIC_BLOCKED');assert.equal(d.stage,'index');
 assert.deepEqual(d.paragraphs,[]);assert.deepEqual(calls,[INDEX_URL]);
 const b=await diagnoseNasaLayout({pythonPath:python,request:reader([],index('area.html'),SENTINEL,302)});
 assert.equal(b.stage,'selected-link');assert.equal(b.fault,'NASA_HTTPS_STATUS_REJECTED');
 assert(!JSON.stringify(b).includes(SENTINEL));
});
