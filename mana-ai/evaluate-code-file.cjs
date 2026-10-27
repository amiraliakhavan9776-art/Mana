'use strict';
// Trusted host benchmark JSON is never mounted inside the candidate namespace.
const path=require('node:path');
const {createPythonCodeSandbox}=require('./src/native/python-code-sandbox.cjs');
const {parseExactJSON}=require('./src/exact-json.cjs');
const {readRegular}=require('./src/native/skill-evolution.cjs');
function main(){const [sourceFile,benchmarkFile]=process.argv.slice(2);if(process.argv.length!==4||![sourceFile,benchmarkFile].every(p=>path.isAbsolute(p)))throw Error('Absolute candidate and trusted benchmark paths required');const task=parseExactJSON(readRegular(benchmarkFile,100000));if(!task||Object.keys(task).sort().join(',')!=='functionName,tests')throw Error('Independent benchmark required');console.log(JSON.stringify(createPythonCodeSandbox().evaluate({sourceFile,...task})));}
try{main();}catch{console.error('Independent code evaluation refused. No host execution fallback.');process.exitCode=1;}
