'use strict';
// Opt-in search via operator-configured loopback SearXNG. Never fetch result pages.
const THEMES=Object.freeze({courtyard_privacy:'architect courtyard house privacy daylight project',narrow_daylight:'architect narrow house lightwell floor plan project',indoor_outdoor:'architect house courtyard indoor outdoor design project'});
const MAX_BYTES=131072,MAX_RESULTS=5,TIMEOUT_MS=5000;
function validateEndpoint(value){const u=new URL(value);if(u.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.pathname!=='/search'||u.search||u.hash)throw Error('Only literal loopback HTTP /search endpoint allowed');return u;}
function safeResultUrl(value){
 if(typeof value!=='string'||value.length>2048)return null;
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!u.hostname.includes('.')||u.hostname.includes(':')||/^\d+(\.\d+){3}$/.test(u.hostname)||/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(u.hostname)||u.hostname.endsWith('.localhost'))return null;return u.href;}catch{return null;}
}
function clean(value,max){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):'';}
async function discoverPrecedents(input,{fetchImpl=globalThis.fetch}={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['optIn','theme','endpoint'].includes(k)))throw Error('Only optIn, theme, endpoint accepted; no brief or identity');
 if(input.optIn!==true)throw Error('Explicit opt-in required: SearXNG may forward generic query to external engines');
 if(!Object.hasOwn(THEMES,input.theme))throw Error('Unsupported fixed generic theme');
 const u=validateEndpoint(input.endpoint);u.searchParams.set('q',THEMES[input.theme]);u.searchParams.set('format','json');u.searchParams.set('pageno','1');
 const base={schema:'MANA_PRECEDENT_DISCOVERY_V1',mode:'live_search_candidates',theme:input.theme,query:THEMES[input.theme],startedAt:new Date().toISOString(),verified:false,pagesFetched:0,geometryGenerated:false,personalBriefTransmitted:false,source:'operator_configured_loopback_searxng',noticeFa:'فقط نامزدهای نتیجهٔ جست‌وجو؛ صفحهٔ منبع خوانده نشده و اعتبار، مجوز استفاده و کیفیت معماری تأیید نشده است. جست‌وجوگر محلی ممکن است عبارت عمومی را به موتورهای بیرونی بفرستد.',candidates:[]};
 const controller=new AbortController();let timer;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('search_timeout'));},TIMEOUT_MS);});
 try{return await Promise.race([deadline,(async()=>{
 const response=await fetchImpl(u.href,{method:'GET',redirect:'error',signal:controller.signal,headers:{accept:'application/json'}});
 if(!response.ok)throw Error('HTTP_'+response.status);if(!response.body)throw Error('missing_body');
 if(Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('response_too_large');
 const reader=response.body.getReader();let bytes=0;const parts=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES)throw Error('response_too_large');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 const data=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!Array.isArray(data.results))throw Error('invalid_results');
 const candidates=[],seen=new Set();let rejected=0;
 for(const r of data.results.slice(0,50)){const url=safeResultUrl(r?.url);if(!url||!r.title||typeof r.title!=='string'){rejected++;continue;}if(seen.has(url))continue;seen.add(url);candidates.push({title:clean(r.title,200),url,searchExcerpt:clean(r.content,500),verification:'unverified_search_result',license:'not_checked',strategy:null});if(candidates.length===MAX_RESULTS)break;}
 return {...base,status:'SEARCH_COMPLETED_UNVERIFIED',responseBytes:bytes,rejectedCandidates:rejected,candidates};
 })()]);}catch(e){controller.abort();return {...base,status:'SEARCH_FAILED',error:clean(e.message,200)};}finally{clearTimeout(timer);}
}
module.exports={discoverPrecedents,safeResultUrl,THEMES,MAX_BYTES};
