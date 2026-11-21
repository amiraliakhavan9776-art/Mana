'use strict';
// Independent geometric oracle: unsigned double polygon area on an integer grid.
// This file is intentionally absent from the learner's read allowlist.
const cases=Object.freeze([
 [1,1,2],[99991,7,1],[1,991,47],[239,1,113],[100000,100000,100000],[1,100000,99999],
 [100000,1,99999],[17,33,91],[33,17,91],[99999,99998,71],[510,510,39],[14,7,3],
 [8,17,1],[561,989,36],[173,717,589],[4567,1234,789],
].map(Object.freeze));
function twiceArea([baseA,baseB,height],offset=17n){
 const a=BigInt(baseA),b=BigInt(baseB),h=BigInt(height);
 const polygon=[[0n,0n],[a,0n],[offset+b,h],[offset,h]];
 const signed=polygon.reduce((sum,[x,y],i)=>{
  const [nextX,nextY]=polygon[(i+1)%polygon.length];
  return sum+x*nextY-y*nextX;
 },0n);
 return signed<0n?-signed:signed;
}
module.exports={cases,twiceArea};
