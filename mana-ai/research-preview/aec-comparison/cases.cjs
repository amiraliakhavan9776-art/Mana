'use strict';
// No private project, expected output, account, or source bytes.
const SOURCE='https://www.grc.nasa.gov/www/k-12/airplane/area.html';
const SCHEMA='MANA_AEC_COMPARISON_V1';
const CASES=Object.freeze([
 {id:'R1',shape:'rectangle',request:'gross',units:['mm','mm'],dimensions:[2750,1830]},
 {id:'R2',shape:'rectangle',request:'gross',units:['mm','mm'],dimensions:[100000,99999]},
 {id:'T1',shape:'trapezoid',request:'gross',units:['mm','mm','mm'],dimensions:[17,10,7]},
 {id:'T2',shape:'trapezoid',request:'gross',units:['mm','mm','mm'],dimensions:[1700,3800,2500]},
 {id:'U1',shape:'rectangle',request:'gross',units:['cm','cm'],dimensions:[210,95]},
 {id:'U2',shape:'trapezoid',request:'gross',units:['mm','cm','mm'],dimensions:[850,65,370]},
 {id:'H1',shape:'trapezoid',request:'gross',units:['mm','mm',null],dimensions:[1700,2100,null],slantMm:430},
 {id:'S1',shape:'rectangle',request:'payable-net',units:['mm','mm'],dimensions:[3400,2800],deductionMm2:1200000},
].map(x=>Object.freeze({...x,units:Object.freeze(x.units),dimensions:Object.freeze(x.dimensions)})));
module.exports={SOURCE,SCHEMA,CASES};
