'use strict';
const path=require('node:path');
const {parseExactJSON}=require('./src/exact-json.cjs');
const {readRegular}=require('./src/native/skill-evolution.cjs');
const {createArtifactImpact}=require('./src/native/artifact-impact.cjs');
try{
 const [file]=process.argv.slice(2);if(process.argv.length!==3||!path.isAbsolute(file))throw Error('Absolute registry input required');
 const data=parseExactJSON(readRegular(file,128000));if(!data||Object.keys(data).sort().join(',')!=='after,before')throw Error('Explicit registry pair required');
 const principal={id:'local-operator',orgId:'local',role:'analyst',projectIds:['local'],capabilityIds:['native.artifacts.impact']},project={id:'local',orgId:'local'};
 const analyzer=createArtifactImpact({authorize:()=>true,verifySnapshot:()=>true});console.log(JSON.stringify({...analyzer.analyze({...data,principal,project}),evidenceAuthority:'Explicit local metadata only; independent project registry and CAD/BIM verification are not established.'},null,2));
}catch{console.error('Artifact impact refused; check scoped registries, version/hash pins and dependency cycles.');process.exitCode=1;}
