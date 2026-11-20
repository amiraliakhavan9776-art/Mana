'use strict';
const {takeoffPlans}=require('../src/furnished/furnished-takeoff.cjs');
let chunks=[],size=0;process.stdin.on('data',c=>{size+=c.length;if(size>1000000){console.error('MODEL_TOO_LARGE');process.exit(1);}chunks.push(c);});process.stdin.on('end',()=>{try{const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));process.stdout.write(JSON.stringify(takeoffPlans(JSON.parse(text))));}catch(e){console.error(e.message);process.exitCode=1;}});
