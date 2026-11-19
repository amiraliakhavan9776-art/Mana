'use strict';
// Reviewed mapping of TWO synthetic tests, not general PDF comprehension, training,
// autonomous research, or completion of either master-document section.
// Source: owner's MANA_AI_Jarvis_Master_Plan_FA_v1_1.pdf, 26 October 2026.
// Reproduce with Poppler pdftotext 25.03.0:
// pdftotext -layout MANA_AI_Jarvis_Master_Plan_FA_v1_1.pdf master.txt
// No normalization: Arabic presentation forms/bidi controls/whitespace are pinned.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const SPEC_SHA256='b9ce58b50834cbbeba50997998a937392bceba613905f611a99bf6df42277ce2';
const MAX_BYTES=131072;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sections={
 '6.4':{start:31943,end:34098,sha256:'e7454332dc9eeb3a1cd616da551b77e40814be82c4c39578e0010952fc3d7fbd'},
 '6.6':{start:35817,end:37855,sha256:'896a8694f15dd3511901ea16031a113c2c6054df076fa88d75ea325495806214'}
};
// Section 6.4: a distinct synthetic surface-area/deduction task, not linear skirting.
const floorArea={schema:'MANA_SKILL_TASK_V1',id:'spec-v11-net-floor-finish-m2',instruction:'Synthetic nonfinancial geometry only. Return the net floor finish area in square metres for a rectangular room with length_m and width_m in metres. excluded_area_m2 is the aggregate area in square metres not receiving finish. Never return a negative area when exclusions exceed the gross floor area. Inputs are nonnegative finite numbers: lengths [0,100], excluded area [0,10000]. No prices, real project decisions, side effects or imports. Output one bounded DSL expression, not prose.',fields:['length_m','width_m','excluded_area_m2'],tests:[
 {input:{length_m:5,width_m:4,excluded_area_m2:3},expected:17},
 {input:{length_m:0,width_m:0,excluded_area_m2:0},expected:0},
 {input:{length_m:2,width_m:3,excluded_area_m2:8},expected:0},
 {input:{length_m:4,width_m:4,excluded_area_m2:16},expected:0},
 {input:{length_m:1,width_m:7,excluded_area_m2:0},expected:7},
 {input:{length_m:3.5,width_m:2.5,excluded_area_m2:0.25},expected:8.5},
 {input:{length_m:100,width_m:100,excluded_area_m2:100},expected:9900},
 {input:{length_m:0,width_m:4,excluded_area_m2:1.5},expected:0}
]};
// Section 6.6 requires explicit units and tested numeric representation.
// Distinct unit-conversion/volume skill; same exact-equality DSL benchmark.
// Binary-exact cases deliberately avoid claiming financial Decimal correctness.
const volume={schema:'MANA_SKILL_TASK_V1',id:'spec-v11-layer-volume-m3',instruction:'Synthetic nonfinancial geometry only. Return the volume in cubic metres of a uniform rectangular layer. length_m and width_m are in metres, thickness_mm is in millimetres (1000 millimetres per metre). Do not interpret the thickness as metres. Inputs are nonnegative finite numbers: lengths [0,100], thickness [0,1000]. No rounding, prices, real structural or construction decisions, side effects or imports. Output one bounded DSL expression, not prose.',fields:['length_m','width_m','thickness_mm'],tests:[
 {input:{length_m:4,width_m:5,thickness_mm:250},expected:5},
 {input:{length_m:4,width_m:5,thickness_mm:0},expected:0},
 {input:{length_m:0,width_m:5,thickness_mm:500},expected:0},
 {input:{length_m:7,width_m:0,thickness_mm:125},expected:0},
 {input:{length_m:2,width_m:3,thickness_mm:1000},expected:6},
 {input:{length_m:1.5,width_m:2,thickness_mm:125},expected:0.375},
 {input:{length_m:100,width_m:100,thickness_mm:500},expected:5000},
 {input:{length_m:2.5,width_m:4,thickness_mm:250},expected:2.5}
]};
function readSpec(specPath){
 if(typeof specPath!=='string'||!path.isAbsolute(specPath)||path.extname(specPath)!=='.txt')throw Error('Explicit absolute plain .txt specification path required');
 const fd=fs.openSync(specPath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 let bytes;
 try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size<1||stat.size>MAX_BYTES)throw Error('Bounded regular specification file required');const buf=Buffer.alloc(MAX_BYTES+1);let size=0,n;while(size<buf.length&&(n=fs.readSync(fd,buf,size,buf.length-size,null))>0)size+=n;if(size>MAX_BYTES)throw Error('Specification exceeds bound');bytes=buf.subarray(0,size);}finally{fs.closeSync(fd);}
 const sha256=hash(bytes);if(sha256!==SPEC_SHA256)throw Error('Unreviewed specification bytes: expected pinned v1.1 pdftotext -layout extraction');
 for(const [id,s] of Object.entries(sections))if(hash(bytes.subarray(s.start,s.end))!==s.sha256)throw Error('Pinned section mismatch: '+id);
 return {sha256,missions:[{id:volume.id,section:'6.6',sectionSha256:sections['6.6'].sha256,task:structuredClone(volume),dependsOn:[]},{id:floorArea.id,section:'6.4',sectionSha256:sections['6.4'].sha256,task:structuredClone(floorArea),dependsOn:[volume.id]}]};
}
module.exports={readSpec};
