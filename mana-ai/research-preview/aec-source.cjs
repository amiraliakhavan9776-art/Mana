'use strict';
const {createHash}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const INDEX_URL='https://www.in.gov/indot/current-programs/certified-technician-program/';
const SOURCE_URL='https://www.in.gov/dA/6c73715b2a/2026-Construction-Procedures-I.pdf?language_id=1';
const PUBLICATION='2026 Construction Procedures I';
const ID='trapezoid-panel-area-twice-mm2';
const FIELDS=Object.freeze(['base_a_mm','base_b_mm','height_mm']);
const MAX=100000;
const MAX_CAPTURE=96*1024;
const SOURCE_OPS=Object.freeze({'+':(a,b)=>a+b,'×':(a,b)=>a*b,x:(a,b)=>a*b,'*':(a,b)=>a*b});
const ANCHORS=Object.freeze([
  [11,5,3],[12,5,3],[11,6,3],[11,5,4],[2,9,5],[3,8,4],[21,19,17],
  [100,99,3],[1,1,1],[2,1,1],[1,2,2],[9,4,7],[23,91,17],[1234,4321,9876],
].map(Object.freeze));
const need=(condition,code)=>{if(!condition)throw Error(code);};
const sha=x=>createHash('sha256').update(x).digest('hex');
function capture(row,url) {
  need(row&&typeof row==='object'&&!Array.isArray(row),'PUBLISHER_CAPTURE_UNAVAILABLE');
  need(row.url===url,'PUBLISHER_URL_MISMATCH');
  need(typeof row.retrievedAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(row.retrievedAt)
    && Number.isFinite(Date.parse(row.retrievedAt)),'PUBLISHER_CAPTURE_TIME_INVALID');
  need(typeof row.text==='string'&&row.text.length>0&&row.text.length<=MAX_CAPTURE
    && Buffer.byteLength(row.text)<=MAX_CAPTURE&&!row.text.includes('\0'),'PUBLISHER_CAPTURE_INVALID');
  return {url,retrievedAt:row.retrievedAt,text:row.text,sha256:sha(row.text)};
}
function choose(index) {
  const lines=index.text.split(/\r?\n/);
  const matches=[];
  let inside=false;
  for(const line of lines) {
    const heading=/^L\d+:\s*#{1,6}\s+(.+?)\s*$/.exec(line);
    if(heading)inside=heading[1]==='Certified Technician Program Manuals';
    if(!inside)continue;
    const entry=/^L(\d{1,7}):\s*【(\d{1,7})†2026 Construction Procedures I】\s*$/.exec(line);
    if(entry)matches.push({number:Number(entry[2]),label:PUBLICATION,indexLine:Number(entry[1])});
  }
  need(matches.length===1,'PUBLISHER_LINK_MISSING_OR_AMBIGUOUS');
  return matches[0];
}
function relation(source) {
  const records=source.text.split(/\r?\n/).flatMap(line=>{
    const match=/^L(\d{1,7})@P(\d{1,3}):\s*(.*?)\s*$/.exec(line);
    return match?[{line:Number(match[1]),page:Number(match[2]),text:match[3]}]:[];
  });
  const headings=records.flatMap((r,i)=>r.page===12&&r.text==='AREA OF A TRAPEZOID'?[i]:[]);
  need(headings.length===1,'SOURCE_TRAPEZOID_SECTION_MISSING_OR_AMBIGUOUS');
  const block=records.slice(headings[0],headings[0]+9), first=block[0].line;
  need(block.length===9&&block.every((r,i)=>r.page===12&&r.line===first+i),'SOURCE_SECTION_INCOMPLETE');
  const body=block.map(r=>r.text.normalize('NFKC'));
  const num=/^A{1,2}\s*=\s*B{1,2}([12])\s*(\+)\s*B{1,2}([12])$/.exec(body[2]);
  const factor=/^([1-9])\s*([×x*])\s*H{1,2}$/.exec(body[3]);
  need(/average width times the altitude\.$/.test(body[1])&&num&&factor&&num[1]!==num[3]&&factor[1]==='2'
    &&body[4]==='where:'&&/^B{1,2}1\s*=\s*length of Base 1$/.test(body[5])
    &&/^B{1,2}2\s*=\s*length of Base 2$/.test(body[6])&&/^H{1,2}\s*=\s*altitude height$/.test(body[7])
    &&/sum of the bases, divided by two, times the height\.$/.test(body[8]),'SOURCE_RELATION_NOT_SUPPORTED');
  const idx=[Number(num[1])-1,Number(num[3])-1];
  return {
    passage:{pageIndex:12,printedPage:'1-3',lineStart:first,lineEnd:first+8,sha256:sha(JSON.stringify(block))},
    denominator:Number(factor[1]),
    twiceArea:row=>SOURCE_OPS[factor[2]](SOURCE_OPS[num[2]](row[idx[0]],row[idx[1]]),row[2]),
  };
}
async function discoverPanelEvidence({readPublisher,sourceMode='host-mediated'}={}) {
  need(typeof readPublisher==='function','PUBLISHER_READER_REQUIRED');
  need(sourceMode==='host-mediated'||sourceMode==='pinned-replay','PUBLISHER_MODE_INVALID');
  const index=capture(await readPublisher({kind:'index',url:INDEX_URL,match:PUBLICATION}),INDEX_URL);
  const link=choose(index);
  // The profile pins one expected official PDF for validation. The actual read
  // must be reached via the selected numbered link, not a substituted URL.
  const document=await readPublisher({kind:'selected-passage',indexUrl:INDEX_URL,link:{...link},expectedUrl:SOURCE_URL,
    match:'Expressed in another way, the area is the sum of the bases',pageIndex:12});
  need(document&&document.parentUrl===index.url&&document.linkNumber===link.number,'PUBLISHER_LINK_PROVENANCE_MISMATCH');
  const source=capture(document,SOURCE_URL);
  const {passage,denominator,twiceArea}=relation(source);
  const fit={
    schema:'MANA_INTEGER_EXAMPLES_V1',id:ID,fields:FIELDS.map(id=>({id,power:1,max:MAX})),outputPower:2,
    examples:ANCHORS.map(tuple=>[[...tuple],twiceArea(tuple)]),
  };
  return {
    status:'OFFICIAL_SOURCE_VERIFIED',sourceUrl:source.url,sourceSha256:source.sha256,
    evidence:{publisher:'Indiana Department of Transportation',publication:PUBLICATION,
      sourceMode,transport:sourceMode==='host-mediated'?'HOST_MEDIATED_WITNESSED_LINK':'OPERATOR_PINNED_CAPTURE_REPLAY',
      directRuntimeNetwork:false,captureRepresentation:'PROVIDER_RENDERED_TEXT_NOT_PDF_BYTES',
      scope:'Single 2026 first-party manual, mathematical formula only; no design, pay quantity or installation claim.',
      index:{url:index.url,sha256:index.sha256,retrievedAt:index.retrievedAt},link,
      source:{url:source.url,sha256:source.sha256,retrievedAt:source.retrievedAt},passage,
      output:{numerator:'twice_area',denominator,unit:'mm²'},
      input:{unit:'mm',minimum:1,maximum:MAX,geometry:'positive parallel base lengths; perpendicular altitude; ideal planar panel'},
    },
    fit,
  };
}
async function readCapturedPanelEvidence(file,pin) {
  need(typeof file==='string'&&file.length<4096&&!file.includes('\0')&&path.isAbsolute(file)&&path.resolve(file)===file,
    'ABSOLUTE_CAPTURE_PATH_REQUIRED');
  need(typeof pin==='string'&&/^[0-9a-f]{64}$/.test(pin),'CAPTURE_PIN_REQUIRED');
  need(fs.realpathSync(file)===file,'CAPTURE_PATH_NOT_CANONICAL');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK|fs.constants.O_NOFOLLOW);
  let bytes;
  try {
    const st=fs.fstatSync(fd);
    need(st.isFile()&&st.size>0&&st.size<=MAX_CAPTURE*3,'CAPTURE_FILE_REJECTED');
    const b=Buffer.alloc(st.size+1);let n=0;
    while(n<b.length){const got=fs.readSync(fd,b,n,b.length-n,null);if(!got)break;n+=got;}
    need(n===st.size,'CAPTURE_FILE_CHANGED');
    bytes=b.subarray(0,n);
  }finally{fs.closeSync(fd);}
  need(sha(bytes)===pin,'CAPTURE_PIN_MISMATCH');
  const records=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  need(records&&Object.keys(records).sort().join(',')==='index,source','CAPTURE_FILE_INVALID');
  const result=await discoverPanelEvidence({sourceMode:'pinned-replay',readPublisher:async request=>request.kind==='index'?records.index:records.source});
  result.evidence.retrievalMode='OPERATOR_PINNED_CAPTURE_REPLAY';
  result.evidence.captureFileSha256=pin;
  return result;
}
module.exports={discoverPanelEvidence,readCapturedPanelEvidence,INDEX_URL,SOURCE_URL,ID};
