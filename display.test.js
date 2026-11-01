import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutSprites} from './display.js';
test('enlarged symbols never overlap in dense queues or during lane changes',()=>{
 let seed=31;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 for(let frame=0;frame<50;frame++){
  const cars=Array.from({length:60},(_,id)=>({id,x:1000+random()*200,lane:id%3,visualLane:random()*2,truck:id%5===0,kind:id%17===0?'ambulance':null}));
  cars.push({id:100,x:1050,lane:-1,visualLane:-1,kind:'recovery',towing:true});
  const sprites=layoutSprites(cars,[{x:1080,lane:0,type:'breakdown',truck:true}],{left:80,laneWidth:50,project:x=>600-x*.1});
  for(let i=0;i<sprites.length;i++)for(let j=i+1;j<sprites.length;j++){
   const a=sprites[i],b=sprites[j];
   const horizontal=Math.abs(a.cx-b.cx)<(a.width+b.width)/2+2;
   const vertical=a.cy<b.cy+b.height&&b.cy<a.cy+a.height;
   assert(!(horizontal&&vertical));
  }
 }
});
