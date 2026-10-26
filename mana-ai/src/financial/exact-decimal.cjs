'use strict';
// Shared bounded decimal arithmetic; callers must explicitly validate rounding policy.
const power=s=>10n**BigInt(s),zero=()=>({n:0n,s:0});
function decimal(x){
 if(typeof x!=='string'||! /^(?:0|[1-9]\d{0,23})(?:\.\d{1,6})?$/.test(x))throw Error('Exact unsigned decimal string required');
 const [whole,fraction='']=x.split('.');return {n:BigInt(whole+fraction),s:fraction.length};
}
function add(a,b){const s=Math.max(a.s,b.s);return {n:a.n*power(s-a.s)+b.n*power(s-b.s),s};}
const sub=(a,b)=>add(a,{n:-b.n,s:b.s});
const mul=(a,b)=>({n:a.n*b.n,s:a.s+b.s});
const cmp=(a,b)=>{const x=sub(a,b).n;return x<0n?-1:x>0n?1:0;};
function round(a,policy){
 const s=policy.scale;if(a.s<=s)return {n:a.n*power(s-a.s),s};
 const divisor=power(a.s-s),sign=a.n<0n?-1n:1n,absolute=a.n*sign,q=absolute/divisor,remainder=absolute%divisor;
 const up=policy.mode!=='toward_zero'&&(remainder*2n>divisor||(remainder*2n===divisor&&(policy.mode==='half_up'||q%2n===1n)));
 return {n:(q+(up?1n:0n))*sign,s};
}
function format(a){const sign=a.n<0n?'-':'',digits=(a.n<0n?-a.n:a.n).toString().padStart(a.s+1,'0');return sign+(a.s?digits.slice(0,-a.s)+'.'+digits.slice(-a.s):digits);}
module.exports={decimal,zero,add,sub,mul,cmp,round,format};
