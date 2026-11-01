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

function overviewFrame(cars,incidents=[],width=320,ramps=[]){
 const g=createRoadGeometry(width,940,10000);
 return {g,opts:{laneWidth:g.laneWidth,left:g.leftAt(0),project:g.project,laneX:g.laneX,angleAt:g.angleAt,overview:true,rampPosition:c=>slipRoadPoint(g,ramps[c.onRamp??c.slipRamp],c.x)}};
}
function centred(sprites,g,ramps=[]){
 for(const c of sprites){
  const ramp=c.onRamp??c.slipRamp;
  const shoulderRejoin=c.lane>=0&&c.fromLane<0&&c.visualLane<0;
  const expected=ramp!=null?slipRoadPoint(g,ramps[ramp],c.x).x:shoulderRejoin?g.laneX(c.x,-1)+(g.laneX(c.x,0)-g.laneX(c.x,-1))*(c.visualLane+1):g.laneX(c.x,c.lane<0?-1:c.visualLane);
  assert.equal(c.cx,expected,'icon moved beside its actual lane position');
  assert.equal(c.cy,g.project(c.x));assert.equal(c.packedOffset,0);
 }
}
test('full-network overview draws every vehicle on its actual lane centre without resizing',()=>{
 const cars=Array.from({length:60},(_,id)=>({id,x:2000+id*8,lane:0,visualLane:0,v:0,length:4.7}));
 cars.push({id:100,x:1900,lane:2,visualLane:2,emergency:true,kind:'police',v:35,length:4.7});
 const incidents=[{id:1,x:2550,lane:0,type:'breakdown',length:4.7}];
 const {g,opts}=overviewFrame(cars,incidents),overview=layoutSprites(cars,incidents,opts);
 paintedApart(overview);centred(overview,g);
 assert.equal(overview.length,61+incidents.length);assert(overview.some(c=>c.static));assert(overview.some(c=>c.emergency));
 assert(overview.every(c=>c.height===c.nominalHeight));assert(overview.filter(c=>!c.emergency).every(c=>Math.abs(c.height-4.7*.0988*.90)<1e-8));
});
test('full-network overview improves visible footprint while Detail retains vehicle artwork',()=>{
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
function paintedApart(sprites){
 const boxes=sprites.filter(c=>c.type!=='roadworks').map(c=>({c,...corners(c)}));
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const a=boxes[i],b=boxes[j];
  assert(!(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top),'painted overlap '+a.c.id+'/'+b.c.id);
 }
 assert(!sprites.some(c=>c.packingOverflow),'icons spilled out of lane');
}
test('fixed full-network overview queues stay separate on their actual lane centres',()=>{
 for(const width of [320,390]){
  const cars=[];let id=0;
  for(let lane=0;lane<3;lane++){
   let x=9200;
   for(let n=0;n<180;n++){
    const truck=n%5===0,kind=n%61===1?'police':n%67===2?'ambulance':null,length=kind==='ambulance'?7:truck?16.5:4.7;
    cars.push({id:id++,x,lane,visualLane:lane,fromLane:lane,truck,kind,length,emergency:!!kind});x-=length+2;
   }
  }
  const layout=createSpriteLayout(),firstFrame=overviewFrame(cars,[],width),first=layout(cars,[],firstFrame.opts);
  paintedApart(first);centred(first,firstFrame.g);assert.equal(first.length,cars.length);
  const sizes=new Map(first.map(c=>[c.id,[c.width,c.height]]));
  for(const c of cars)c.x+=.01;
  const nextFrame=overviewFrame(cars,[],width),next=layout(cars,[],nextFrame.opts);
  paintedApart(next);centred(next,nextFrame.g);
  for(const c of next)assert.deepEqual([c.width,c.height],sizes.get(c.id));
 }
});
test('single-file icons remain separate through actual closure and slip-road merges',async()=>{
 const {Simulation}=await import('./model.js');let seed=73;
 const s=new Simulation(()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296));
 s.nextIncident=s.nextEmergency=Infinity;s.signals[1][0].mode='closed';
 s.systems.work.announceAt=s.systems.work.startsAt=s.systems.roadblock.startsAt=Infinity;
 const layout=createSpriteLayout();
 for(let step=0;step<700;step++){
  s.step(.1);
  const cars=[...s.cars,...s.systems.ramps.flatMap(r=>r.queue)],{g,opts}=overviewFrame(cars,s.incidents,320,s.systems.ramps),sprites=layout(cars,s.incidents,opts);
  paintedApart(sprites);centred(sprites,g,s.systems.ramps);
  assert.equal(sprites.filter(c=>!c.static).length,cars.length);
 }
 assert(s.systems.ramps.some(r=>r.joined>0));
});

test('lane-change heading turns right or left and unwinds with eased lateral velocity',()=>{
 const car={id:1,x:2000,lane:1,fromLane:0,visualLane:.5,v:25,length:4.7};
 for(const overview of [false,true])for(const direction of [-1,1]){
  const samples=[0,.08,.25,.4,.25,.08,0].map(rate=>layoutSprites([{...car,laneChangeRate:rate*direction}],[],{...options,angleAt:()=>0,overview})[0]);
  assert.equal(samples[0].angle,0);assert.equal(samples.at(-1).angle,0);
  assert(samples.slice(1,-1).every(c=>Math.sign(c.angle)===direction));
  assert(Math.abs(samples[3].angle)>Math.abs(samples[1].angle));
  assert(samples.every(c=>Math.abs(c.angle)<=(overview?.025:.30)));
  assert(samples.every(c=>c.width===samples[0].width&&c.height===samples[0].height));
 }
 const truck=layoutSprites([{...car,truck:true,laneChangeRate:2}],[],{...options,angleAt:()=>0,overview:true})[0];
 assert(truck.angle<=.025);
});
test('stopped scenes, shoulder vehicles and slip roads add no lane-change yaw',()=>{
 const cars=Array.from({length:12},(_,id)=>({id,x:2000+id*6.7,lane:0,visualLane:0,v:0,length:4.7,laneChangeRate:0}));
 cars.push({id:20,x:2400,lane:-1,visualLane:-1,v:20,kind:'recovery',length:11,laneChangeRate:.4});
 cars.push({id:21,x:2600,lane:0,visualLane:0,onRamp:0,length:4.7,laneChangeRate:.4});
 const incidents=[{id:30,x:2800,lane:0,type:'breakdown',length:4.7,laneChangeRate:.4}],ramps=[{id:0,x:3000,mergeLength:600,approachLength:1100,queue:[]}];
 const {g,opts}=overviewFrame(cars,incidents,320,ramps);
 const sprites=layoutSprites(cars,incidents,{...opts,angleAt:()=>0,rampPosition:c=>({x:60,y:g.project(c.x),angle:.01})});
 for(const c of sprites){assert.equal(c.angle,c.onRamp===0?.01:0);assert.equal(c.packedOffset,0);}
 paintedApart(sprites);
});
test('turning icons stay in single file during dense live merging',async()=>{
 const {Simulation}=await import('./model.js');let seed=51;
 const s=new Simulation(()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296));
 s.cars=[];s.systemsEnabled=false;s.waiting=0;s.nextArrival=s.nextIncident=s.nextEmergency=Infinity;
 for(let lane=0;lane<3;lane++)for(let n=0;n<100;n++)s.spawn(lane,300+n*30,15);
 s.signals[1][0].mode='closed';const layout=createSpriteLayout();let turning=0;
 for(let step=0;step<800;step++){
  s.step(.1);const {g,opts}=overviewFrame(s.cars,s.incidents),sprites=layout(s.cars,s.incidents,opts);
  paintedApart(sprites);centred(sprites,g);
  for(const c of sprites)if(Math.abs(c.laneChangeRate??0)>.01)turning++;
 }
 assert(turning>100);
});
test('fixed camera separates a turned nose without moving the road or vehicle sideways',()=>{
 const cars=[
  {id:1,x:900,lane:0,visualLane:0,length:4.7,laneChangeRate:0},
  {id:2,x:868,lane:1,visualLane:1,length:4.7,laneChangeRate:0},
  {id:3,x:867.8,lane:0,visualLane:0,length:4.7,laneChangeRate:.42},
 ];
 const {g,opts}=overviewFrame(cars),sprites=layoutSprites(cars,[],opts);
 paintedApart(sprites);centred(sprites,g);
});


test('overview sizes stay fixed through traffic changes and keep the full 10 km camera',()=>{
 for(const width of [320,390]){
  const {g,opts}=overviewFrame([],[],width);
  const cars=[{id:1,x:4000,lane:0,visualLane:0,length:4.7},{id:2,x:4010,lane:0,visualLane:0,length:16.5,truck:true},{id:3,x:4100,lane:1,visualLane:1,length:4.7,kind:'police',emergency:true}];
  const first=layoutSprites(cars,[],opts),sizes=new Map(first.map(c=>[c.id,[c.width,c.height]]));
  const landmarks=[450,1550,2650,3750,4850,6450,8050].map(x=>[g.center(x),g.project(x)]);
  cars[1].x=4020;cars.push(...Array.from({length:200},(_,n)=>({id:100+n,x:8000-n*6.7,lane:2,visualLane:2,length:4.7})));
  const nextFrame=overviewFrame(cars,[],width),next=layoutSprites(cars,[],nextFrame.opts);
  assert.equal(next.length,cars.length);centred(next,nextFrame.g);
  for(const c of next)if(sizes.has(c.id))assert.deepEqual([c.width,c.height],sizes.get(c.id));
  assert.deepEqual([450,1550,2650,3750,4850,6450,8050].map(x=>[nextFrame.g.center(x),nextFrame.g.project(x)]),landmarks);
  assert.equal(nextFrame.g.height,940);assert.equal(nextFrame.g.project(0),964);assert.equal(nextFrame.g.project(10000),-24);
 }
});


test('overview marks have a larger visible footprint without lifting the physical road scale',()=>{
 const cars=[
  {id:1,x:4000,lane:0,visualLane:0,length:4.7},
  {id:2,x:4100,lane:1,visualLane:1,length:16.5,truck:true},
  {id:3,x:4200,lane:2,visualLane:2,length:7,kind:'ambulance',emergency:true},
 ];
 const {opts}=overviewFrame(cars),sprites=layoutSprites(cars,[],opts),scale=.0988;
 for(const c of sprites){
  const oldWidth=c.truck?1.6:c.emergency?1.4:1.2,oldArea=oldWidth*c.length*scale*.68;
  assert(c.width*c.height>oldArea*2.5,'overview footprint did not visibly increase');
  assert(c.height<=c.length*scale,'overview body exceeded fixed physical footprint');
 }
 const turning=layoutSprites(cars.map(c=>({...c,laneChangeRate:.42})),[],opts);
 for(const c of turning){assert(Math.abs(c.angle)<=.025);const before=sprites.find(s=>s.id===c.id);assert.deepEqual([c.width,c.height],[before.width,before.height]);}
});


test('a recovery truck steers continuously from the shoulder into the running lane',()=>{
 for(const overview of [false,true]){
  const g=createRoadGeometry(390,940,10000),opts={left:g.leftAt(0),laneWidth:g.laneWidth,project:g.project,laneX:g.laneX,angleAt:()=>0,overview};
  const x=4000,shoulder=g.laneX(x,-1),lane=g.laneX(x,0);let previous=shoulder;
  for(let n=0;n<=100;n++){
   const progress=n/100,c={id:1,x,lane:0,fromLane:-1,visualLane:-1+progress,kind:'recovery',length:16,laneChangeRate:n===0||n===100?0:.3};
   const sprite=layoutSprites([c],[],opts)[0];
   assert(Math.abs(sprite.cx-(shoulder+(lane-shoulder)*progress))<1e-8);
   assert(sprite.cx>=previous-1e-8&&sprite.cx-previous<.5);previous=sprite.cx;
   assert.equal(sprite.cy,g.project(x));assert(sprite.angle>=0);
  }
  assert.equal(previous,lane);
 }
});
