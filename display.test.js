import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutSprites,createSpriteLayout} from './display.js';
const options={left:90,laneWidth:55,project:x=>600-(x-1350)*1.41};
function separated(sprites){
 for(let a=0;a<sprites.length;a++)for(let b=a+1;b<sprites.length;b++){
  const x=sprites[a],y=sprites[b];
  assert(!(Math.abs(x.cx-y.cx)<(x.width+y.width)/2+2&&x.cy<y.cy+y.height&&y.cy<x.cy+x.height));
 }
}
test('vehicle dimensions do not change with smaller gaps, queue density or camera position',()=>{
 const cars=[{id:1,x:1000,lane:0,visualLane:0},{id:2,x:1200,lane:0,visualLane:0,truck:true},{id:3,x:1400,lane:1,visualLane:1,kind:'ambulance'},{id:4,x:1450,lane:-1,visualLane:-1,kind:'recovery'}];
 const first=layoutSprites(cars,[],options);const sizes=new Map(first.map(c=>[c.id,[c.width,c.height]]));
 cars[1].x=1010;
 for(const offset of [0,1350,3000,5500]){
  const sprites=layoutSprites(cars,[],{...options,project:x=>600-(x-offset)*1.41});
  for(const c of sprites){assert.deepEqual([c.width,c.height],sizes.get(c.id));assert.equal(c.height,c.nominalHeight);}
 }
});
test('fixed-size symbols remain separate and forward-only during a lane change',()=>{
 const layout=createSpriteLayout();const cars=[{id:1,x:1000,lane:0,visualLane:0},{id:2,x:1020,lane:1,visualLane:1},{id:3,x:990,lane:1,visualLane:1},{id:4,x:960,lane:1,visualLane:1}];
 let previous=new Map();
 for(let step=0;step<120;step++){
  for(const c of cars)c.x+=.4;cars[0].lane=1;cars[0].visualLane=Math.min(1,step/90);
  const sprites=layout(cars,[],options);separated(sprites);
  for(const c of sprites){assert.equal(c.height,6);if(previous.has(c.id))assert(c.cy<=previous.get(c.id).cy+1e-7);}
  previous=new Map(sprites.map(c=>[c.id,c]));
 }
});
test('live fixed-size traffic stays separated through incidents and recovery',async()=>{
 const {Simulation}=await import('./model.js');let n=142;
 const sim=new Simulation(()=>((n=(n*1664525+1013904223)>>>0)/4294967296));const layout=createSpriteLayout();
 const sizes=new Map();
 for(let step=0;step<900;step++){
  sim.step(.1);const sprites=layout(sim.cars,sim.incidents,options);separated(sprites);
  for(const c of sprites.filter(c=>!c.static)){
   if(sizes.has(c.id))assert.deepEqual([c.width,c.height],sizes.get(c.id));
   sizes.set(c.id,[c.width,c.height]);assert.equal(c.cy,options.project(c.x));
  }
 }
});
test('visible lane positions follow the model through crowded closure merges',async()=>{
 const {Simulation}=await import('./model.js');let n=42;
 const sim=new Simulation(()=>((n=(n*1664525+1013904223)>>>0)/4294967296));
 sim.nextIncident=sim.nextEmergency=Infinity;sim.signals[1][0].mode='closed';let changes=0;
 for(let step=0;step<1200;step++){
  const before=new Map(sim.cars.map(c=>[c.id,c.lane]));sim.step(.1);
  const sprites=layoutSprites(sim.cars,sim.incidents,options);separated(sprites);
  for(const c of sim.cars){if(before.has(c.id)&&c.lane!==before.get(c.id))changes++;
   const sprite=sprites.find(x=>!x.static&&x.id===c.id);
   assert.equal(sprite.cx,c.lane<0?80:90+(c.visualLane+.5)*55);assert.equal(sprite.cy,options.project(c.x));
  }
 }
 assert(changes>5);
});
