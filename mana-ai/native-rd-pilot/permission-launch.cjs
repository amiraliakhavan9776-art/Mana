'use strict';
const fs=require('node:fs'),{createHash}=require('node:crypto');
const [worker,pinWorker,training,pinTraining]=process.argv.slice(2);
const sha=x=>createHash('sha256').update(x).digest('hex');
if(sha(fs.readFileSync(worker))!==pinWorker)throw Error('worker pin');
const train=fs.readFileSync(training);if(sha(train)!==pinTraining)throw Error('training pin');
const result=require(worker).synthesize(JSON.parse(train));
process.stdout.write(JSON.stringify({...result,trainingFileSha256:pinTraining,workerSha256:pinWorker},null,2)+'\n');
