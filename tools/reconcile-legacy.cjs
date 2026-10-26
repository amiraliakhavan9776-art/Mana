'use strict';
// stdout contains digests and differences, never raw records. No writes/imports.
const fs=require('node:fs');
const {compareLegacySnapshots}=require('../mana-ai/src/legacy-reconciliation.cjs');
function read(file){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>45*1024*1024)throw Error('Bounded regular snapshot file required');return JSON.parse(fs.readFileSync(fd,'utf8'));}finally{fs.closeSync(fd);}
}
try{
 if(process.argv.length!==4)throw Error('Usage: node tools/reconcile-legacy.cjs BEFORE.json AFTER.json');
 const result=compareLegacySnapshots(read(process.argv[2]),read(process.argv[3]));
 process.stdout.write(JSON.stringify(result,null,2)+'\n');process.exitCode=result.passed?0:2;
}catch{process.stderr.write('Reconciliation refused: invalid, unsupported, unsafe or unreadable snapshot; originals unchanged.\n');process.exitCode=1;}
