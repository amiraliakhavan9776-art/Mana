'use strict';
// Review-only CLI: node native-skill-draft.cjs /abs/spec.json /abs/output-dir
const fs=require('node:fs'),path=require('node:path');
const {compile}=require('./src/native/native-skill-compiler.cjs');
function main(){
 const [filename,out]=process.argv.slice(2);
 if(process.argv.length!==4||!path.isAbsolute(filename)||!path.isAbsolute(out))throw Error('Two absolute paths required');
 const input=fs.realpathSync(filename), st=fs.lstatSync(input);
 if(!st.isFile()||st.size>32000)throw Error('Invalid spec file');
 if(fs.existsSync(out))throw Error('Output directory must not exist');
 const spec=JSON.parse(fs.readFileSync(input,'utf8'));
 const result=compile(spec);
 fs.mkdirSync(out,{mode:0o700,recursive:false});
 fs.writeFileSync(path.join(out,'skill.py'),result.source,{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(out,'test_skill.py'),result.vectorSource,{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({...result,source:undefined,vectorSource:undefined},null,2)+'\n',{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify({status:'DRAFT_AWAITING_SANDBOX',directory:out,sha256:result.sourceSha256,approved:false})+'\n');
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
