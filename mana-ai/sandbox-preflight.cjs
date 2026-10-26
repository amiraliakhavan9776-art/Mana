'use strict';
const {createPythonCodeSandbox}=require('./src/native/python-code-sandbox.cjs');
const result=createPythonCodeSandbox().preflight();console.log(JSON.stringify(result,null,2));if(result.status!=='SANDBOX_PREFLIGHT_PASSED')process.exitCode=2;
