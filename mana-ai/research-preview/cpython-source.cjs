'use strict';
const {createHash} = require('node:crypto');
const REPOSITORY = 'python/cpython';
const COMMIT = '6cb20a219a860eaf687b2d968b41c480c7461909';
const ROOT = 'Doc/library/index.rst';
const SYMBOL = 'math.fma';
const URL_ROOT = 'https://github.com/' + REPOSITORY + '/blob/' + COMMIT + '/';
const PYTHON_SYMBOL_URL = 'https://docs.python.org/3.13/library/math.html#math.fma';
const VERSION = '3.13.5';
const MAX_BYTES = 64 * 1024;
const PINS = Object.freeze({
  [ROOT]: '44b218948d07e1ace3ff9a3aec10f96a98b47d9a',
  'Doc/library/numeric.rst': '7c76a479d73b2641c510e7d54e0815e0451bdcae',
  'Doc/library/math.rst': '230e34768bfc056aa393332d944ad2dc670f02d9',
});
const need = (value, message) => { if (!value) throw Error(message); };
const sha256 = x => createHash('sha256').update(x).digest('hex');
function readRecord(row, path) {
  need(Object.hasOwn(PINS,path) && row && typeof row==='object' && !Array.isArray(row), 'SOURCE_UNAVAILABLE');
  need(row.repository===REPOSITORY && row.commit===COMMIT && row.path===path && row.url===URL_ROOT+path
    && row.gitBlobSha===PINS[path], 'SOURCE_IDENTITY_MISMATCH');
  need(typeof row.retrievedAt==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(row.retrievedAt)
    && Number.isFinite(Date.parse(row.retrievedAt)), 'SOURCE_CAPTURE_TIME_INVALID');
  need(typeof row.contentBase64==='string' && row.contentBase64.length<=Math.ceil(MAX_BYTES/3)*4+1024
    && /^[A-Za-z0-9+/=\r\n]+$/.test(row.contentBase64), 'SOURCE_ENCODING_INVALID');
  const encoded=row.contentBase64.replace(/[\r\n]/g,'');
  const bytes=Buffer.from(encoded,'base64');
  need(bytes.length>0 && bytes.length<=MAX_BYTES && bytes.toString('base64')===encoded, 'SOURCE_ENCODING_INVALID');
  const git=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  need(git===PINS[path], 'SOURCE_BLOB_MISMATCH');
  const body=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  need(!body.includes('\0'), 'SOURCE_ENCODING_INVALID');
  return {body, receipt:{path,url:row.url,retrievedAt:row.retrievedAt,gitBlobSha:git,byteCount:bytes.length,sha256:sha256(bytes)}};
}
function selectChild(parent, label) {
  const lines=parent.body.split('\n');
  const rows=[];
  for(let i=0;i<lines.length;i++){
    if(lines[i]!=='.. toctree::') continue;
    for(let j=i+1;j<lines.length;j++){
      const line=lines[j];
      if(!line.trim()) continue;
      if(!line.startsWith('   ')) break;
      if(line==='   '+label+'.rst') rows.push({line:j+1,text:line});
    }
  }
  need(rows.length===1, 'MISSING_OR_AMBIGUOUS_TOC_LINK');
  const child='Doc/library/'+rows[0].text.trim();
  need(Object.hasOwn(PINS,child), 'SOURCE_PATH_REJECTED');
  return {parentPath:parent.receipt.path,childPath:child,tocLine:rows[0].line,tocText:rows[0].text};
}
function readDeclaration(moduleDoc) {
  const lines=moduleDoc.body.split('\n');
  const matches=lines.flatMap((line,i)=>/^\.\. function:: fma\b/.test(line)?[i]:[]);
  need(matches.length===1, 'MISSING_OR_AMBIGUOUS_DECLARATION');
  const i=matches[0];
  need(lines[i]==='.. function:: fma(x, y, z)', 'UNSUPPORTED_DECLARATION');
  const block=[];
  for(let j=i+1;j<lines.length&&j<=i+30;j++){
    const line=lines[j];
    if(line && !line.startsWith('   ')) break;
    block.push(line);
  }
  need(block.filter(l=>l==='   .. versionadded:: 3.13').length===1,'UNSUPPORTED_DOCUMENTATION_VERSION');
  const para=block.slice(1,block.indexOf('',1)).map(l=>l.trim()).join(' ');
  const sentence=/^Fused multiply-add operation\. Return ``([()xyz0-4+*\- ]{1,80})``, computed as though with infinite precision and range followed by a single round to the ``float`` format\./.exec(para);
  need(sentence, 'UNSUPPORTED_DOCUMENTED_RELATION');
  const prose=sentence[0].replace(/``/g,'');
  return {
    declaration:lines[i],
    declarationLine:i+1,
    relation:sentence[1],
    parameters:['x','y','z'],
    roundingScope:'Documentation describes one float rounding; the CPU projection is exact nonnegative integers only.',
    versionAdded:'3.13',
    rawRstPassage:[lines[i],...block].join('\n').trimEnd(),
    normalizedPassage:SYMBOL+'(x, y, z)¶\n\n'+prose,
  };
}
async function researchFma({readOfficial}={}) {
  need(typeof readOfficial==='function','OFFICIAL_READER_REQUIRED');
  const read=async path=>readRecord(await readOfficial(path),path);
  const root=await read(ROOT);
  // Closed lexical profile: the known symbol's math topic selects the numeric
  // TOC category and its own exact module name. A path is followed only when
  // the real pinned publisher TOC contains that child.
  const moduleName=SYMBOL.split('.')[0];
  const topic=Object.freeze({math:'numeric'})[moduleName];
  const first=selectChild(root,topic);
  const category=await read(first.childPath);
  const second=selectChild(category,moduleName);
  const doc=await read(second.childPath);
  const {normalizedPassage,...facts}=readDeclaration(doc);
  const source={
    schema:'MANA_CPYTHON_OFFICIAL_RESEARCH_V1',repository:REPOSITORY,commit:COMMIT,
    version:VERSION,symbol:SYMBOL,transport:'HOST_MEDIATED_GITHUB_CONNECTOR',
    rootPath:ROOT,links:[first,second],captures:[root.receipt,category.receipt,doc.receipt],
    directRuntimeNetwork:false,discoveryScope:'Pinned publisher documentation tree only',...facts,
  };
  const legacyCapture={
    url:PYTHON_SYMBOL_URL,
    title:'math.fma — normalized projection from pinned CPython 3.13.5 RST (not an HTTP capture of this URL)',
    retrievedAt:doc.receipt.retrievedAt,
    passages:[{id:'cpython-v3.13.5-math-rst-L'+facts.declarationLine,text:normalizedPassage}],
    provenance:{kind:'RST_NORMALIZED_LEGACY_PROJECTION',sourceUrl:doc.receipt.url,sourceSha256:doc.receipt.sha256},
  };
  return {status:'OFFICIAL_SOURCE_VERIFIED',source,legacyCapture};
}

module.exports={researchFma,REPOSITORY,COMMIT,ROOT,SYMBOL,PINS};
