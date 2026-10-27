'use strict';
// Host-installed provider contracts. Missing providers never return placeholder success.
function createExternalProviders(providers={}){
 const supported=['ifc','render','word','language','speech'];
 if(!providers||typeof providers!=='object'||Object.keys(providers).some(k=>!supported.includes(k)))throw Error('Unknown provider');
 const installed=new Map();for(const [kind,p] of Object.entries(providers)){if(!p||typeof p.version!=='string'||!p.version||typeof p.run!=='function'||typeof p.verify!=='function')throw Error('Versioned provider and independent verifier required');installed.set(kind,Object.freeze({...p}))}
 return Object.freeze({availability:()=>supported.map(kind=>({kind,available:installed.has(kind),version:installed.get(kind)?.version??null})),
  async execute({kind,input,signal}){if(!supported.includes(kind))throw Error('Unknown provider');const p=installed.get(kind);if(!p)return {status:'DEPENDENCY_UNAVAILABLE',kind};if(signal?.aborted)throw Error('Aborted');const result=await p.run({input,signal});if(signal?.aborted)throw Error('Aborted');if(await p.verify({input,result})!==true)throw Error('Provider output rejected');return {status:'VERIFIED_PROVIDER_OUTPUT',kind,version:p.version,result}}
 });
}
module.exports={createExternalProviders};
