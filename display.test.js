import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutSprites,createSpriteLayout} from './display.js';
import {createRoadGeometry,slipRoadPoint} from './road.js';
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
  sim.systemsEnabled=false;sim.step(.1);const sprites=layout(sim.cars,sim.incidents,options);separated(sprites);
  for(const c of sprites.filter(c=>!c.static)){
   if(sizes.has(c.id))assert.deepEqual([c.width,c.height],sizes.get(c.id));
   sizes.set(c.id,[c.width,c.height]);assert.equal(c.cy,options.project(c.x));
  }
 }
});
test('visible lane positions follow the model through crowded closure merges',async()=>{
 const {Simulation}=await import('./model.js');let n=42;
 const sim=new Simulation(()=>((n=(n*1664525+1013904223)>>>0)/4294967296));
 sim.systemsEnabled=false;sim.nextIncident=sim.nextEmergency=Infinity;sim.signals[1][0].mode='closed';let changes=0;
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

test('full-network overview draws every vehicle without density-dependent resizing',()=>{
 const cars=Array.from({length:60},(_,id)=>({id,x:2000+id*8,lane:0,visualLane:0,v:0,length:4.7}));
 cars.push({id:100,x:1900,lane:2,visualLane:2,emergency:true,kind:'police',v:35,length:4.7});
 const incidents=[{id:1,x:2550,lane:0,type:'breakdown',length:4.7}];
 const overview=layoutSprites(cars,incidents,{left:90,laneWidth:55,project:x=>550-x*.085,overview:true});
 const visible=overview.filter(c=>c.visible);
 assert.equal(visible.length,overview.length);assert(visible.some(c=>c.static));assert(visible.some(c=>c.emergency));
 assert(overview.every(c=>c.height===c.nominalHeight));assert(overview.filter(c=>!c.emergency).every(c=>c.height===3));assert.equal(overview.length,61+incidents.length);

});

test('overview keeps recognisable compact car, HGV and emergency artwork',()=>{
 const cars=[{id:1,x:1000,lane:0,visualLane:0},{id:2,x:1300,lane:1,visualLane:1,truck:true},{id:3,x:1600,lane:2,visualLane:2,kind:'ambulance'},{id:4,x:2000,lane:2,visualLane:2,kind:'police'},{id:5,x:2500,lane:-1,visualLane:-1,kind:'recovery'}];
 const detail=layoutSprites(cars,[],options),overview=layoutSprites(cars,[],{...options,project:x=>550-x*.085,overview:true});
 for(const c of overview){const d=detail.find(x=>x.id===c.id);assert.deepEqual([c.designWidth,c.designHeight],[d.width,d.height]);assert(c.width<d.width&&c.height<d.height);assert.equal(c.cy,550-c.x*.085);}
 assert(overview.find(c=>c.truck).height>overview.find(c=>c.id===1).height);
});

function corners(c){
 const cs=Math.cos(c.angle),sn=Math.sin(c.angle);
 const points=[[-c.width/2,0],[c.width/2,0],[-c.width/2,c.height],[c.width/2,c.height]].map(([x,y])=>({x:c.cx+x*cs-y*sn,y:c.cy+x*sn+y*cs}));
 return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
}
function packedApart(sprites){
 const boxes=sprites.filter(c=>c.type!=='roadworks').map(c=>({c,...corners(c)}));
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const a=boxes[i],b=boxes[j];
  assert(!(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top),'painted overlap '+a.c.id+'/'+b.c.id);
 }
 assert(!sprites.some(c=>c.packingOverflow),'icons spilled out of lane');
}
test('small overview icons stay separate in physically stopped mixed queues on narrow mobile roads',()=>{
 for(const width of [320,390]){
  const g=createRoadGeometry(width,940,10000),cars=[];let id=0;
  for(let lane=0;lane<3;lane++){
   let x=9200;
   for(let n=0;n<180;n++){
    const truck=n%5===0,kind=n%61===1?'police':n%67===2?'ambulance':null,length=kind==='ambulance'?7:truck?16.5:4.7;
    cars.push({id:id++,x,lane,visualLane:lane,fromLane:lane,truck,kind,length,emergency:!!kind});x-=length+2;
   }
  }
  const layout=createSpriteLayout(),opts={laneWidth:g.laneWidth,left:g.leftAt(0),project:g.project,laneX:g.laneX,angleAt:g.angleAt,overview:true};
  const first=layout(cars,[],opts);packedApart(first);assert.equal(first.length,cars.length);
  const sizes=new Map(first.map(c=>[c.id,[c.width,c.height]])),offsets=new Map(first.map(c=>[c.id,c.packedOffset]));
  for(const c of cars)c.x+=.01;
  const next=layout(cars,[],opts);packedApart(next);
  for(const c of next){assert.deepEqual([c.width,c.height],sizes.get(c.id));assert.equal(c.cy,g.project(c.x));assert.equal(c.packedOffset,offsets.get(c.id));}
 }
});
test('compact icons remain separate through actual closure and slip-road merges',async()=>{
 const {Simulation}=await import('./model.js');let seed=73;
 const s=new Simulation(()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296));
 s.nextIncident=s.nextEmergency=Infinity;s.signals[1][0].mode='closed';
 s.systems.work.announceAt=s.systems.work.startsAt=s.systems.roadblock.startsAt=Infinity;
 const g=createRoadGeometry(320,940,10000),layout=createSpriteLayout();
 const opts={laneWidth:g.laneWidth,left:g.leftAt(0),project:g.project,laneX:g.laneX,angleAt:g.angleAt,overview:true,rampPosition:c=>slipRoadPoint(g,s.systems.ramps[c.onRamp??c.slipRamp],c.x)};
 for(let step=0;step<700;step++){
  s.step(.1);
  const cars=[...s.cars,...s.systems.ramps.flatMap(r=>r.queue)],sprites=layout(cars,s.incidents,opts);packedApart(sprites);
  assert.equal(sprites.filter(c=>!c.static).length,cars.length);
 }
 assert(s.systems.ramps.some(r=>r.joined>0));
});
