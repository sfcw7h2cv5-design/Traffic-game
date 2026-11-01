import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutSprites,createSpriteLayout} from './display.js';
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

test('merges never push existing display positions backwards or overlap them',()=>{
 const layout=createSpriteLayout(),options={left:80,laneWidth:50,project:x=>600-x*.1};
 let cars=[{id:1,x:1000,lane:0,visualLane:0},{id:2,x:1020,lane:1,visualLane:1},{id:3,x:990,lane:1,visualLane:1},{id:4,x:960,lane:1,visualLane:1}];
 let previous=new Map();
 for(let frame=0;frame<120;frame++){
  for(const c of cars)c.x+=.4;
  cars[0].lane=1;cars[0].visualLane=Math.min(1,frame/90);
  const sprites=layout(cars,[],options);
  for(const c of sprites)if(previous.has(c.id))assert(c.cy<=previous.get(c.id).cy+1e-8,'symbol moved backwards');
  for(let i=0;i<sprites.length;i++)for(let j=i+1;j<sprites.length;j++){
   const a=sprites[i],b=sprites[j];
   assert(!(Math.abs(a.cx-b.cx)<(a.width+b.width)/2+2&&a.cy<b.cy+b.height&&b.cy<a.cy+a.height));
  }
  previous=new Map(sprites.map(c=>[c.id,c]));
 }
});

test('live traffic rendering stays separated and forward-only through incidents and recovery',async()=>{
 const {Simulation}=await import('./model.js');let n=142;
 const sim=new Simulation(()=>((n=(n*1664525+1013904223)>>>0)/4294967296));
 const layout=createSpriteLayout(),options={left:90,laneWidth:55,project:x=>630-x*.094};
 let previous=new Map();const key=c=>c.static&&c.vehicleId==null?'incident:'+c.id:'car:'+(c.static?c.vehicleId:c.id);
 for(let step=0;step<900;step++){
  sim.step(.1);const sprites=layout(sim.cars,sim.incidents,options);
  for(const c of sprites)if(previous.has(key(c)))assert(c.cy<=previous.get(key(c)).cy+1e-7);
  for(let a=0;a<sprites.length;a++)for(let b=a+1;b<sprites.length;b++){
   const x=sprites[a],y=sprites[b];
   assert(!(Math.abs(x.cx-y.cx)<(x.width+y.width)/2+2&&x.cy<y.cy+y.height&&y.cy<x.cy+x.height));
  }
  previous=new Map(sprites.map(c=>[key(c),c]));
 }
});

test('visible lane positions always follow the model, including in crowded closure merges',async()=>{
 const {Simulation}=await import('./model.js');let n=42;
 const sim=new Simulation(()=>((n=(n*1664525+1013904223)>>>0)/4294967296));
 sim.nextIncident=sim.nextEmergency=Infinity;sim.signals[1][0].mode='closed';
 const layout=createSpriteLayout(),options={left:90,laneWidth:55,project:x=>630-x*.094};
 let changes=0;
 for(let step=0;step<1200;step++){
  const before=new Map(sim.cars.map(c=>[c.id,c.lane]));sim.step(.1);
  const sprites=layout(sim.cars,sim.incidents,options);
  for(const c of sim.cars){
   if(before.has(c.id)&&c.lane!==before.get(c.id))changes++;
   const sprite=sprites.find(x=>!x.static&&x.id===c.id);
   assert(Math.abs(sprite.cx-(c.lane<0?80:90+(c.visualLane+.5)*55))<1e-7);
   assert(Math.abs(sprite.cy-options.project(c.x))<1e-7);
  }
 }
 assert(changes>5);
});
