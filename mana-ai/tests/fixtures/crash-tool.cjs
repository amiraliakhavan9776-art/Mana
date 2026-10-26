'use strict';
module.exports={id:'crash',title:'crash',requires:['source'],produces:['done'],workUnits:1,risk:'read',version:'v1',validate:()=>true,validateDependencies:()=>true,run:()=>{if(process.send)process.send('claimed');return new Promise(()=>{})},verify:({result})=>result.ok===true};
