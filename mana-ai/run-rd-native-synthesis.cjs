'use strict';
const {createNativeRd}=require('./src/pilot/mana-native-rd.cjs');
try{
 const [op,workspace,masterPath,...extra]=process.argv.slice(2);
 if(extra.length||!['inspect','run'].includes(op)||!workspace||!masterPath)throw Error('Usage: node run-rd-native-synthesis.cjs <inspect|run> /absolute/private-workspace /absolute/master.txt');
 console.log(JSON.stringify(createNativeRd({workspace,masterPath})[op](),null,2));
}catch(e){console.error(JSON.stringify({status:'BLOCKED',error:e.message,modelCalls:0,activationAuthorized:false}));process.exitCode=1;}
