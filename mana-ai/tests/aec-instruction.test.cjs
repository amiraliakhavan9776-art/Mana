'use strict';
require('../research-preview/persian-intake.test.cjs');
require('../research-preview/aec-source.test.cjs');
require('../research-preview/aec-instruction-preview.test.cjs');
if(Number(process.versions.node.split('.')[0])>=24)require('../research-preview/aec-learner.test.cjs');
