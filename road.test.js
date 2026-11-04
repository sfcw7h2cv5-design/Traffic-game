import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoadGeometry,slipRoadPoint,slipRoadEdges,offRampPoint,roadworkCones} from './road.js';
import {layoutSprites} from './display.js';
import {Simulation,LENGTH,GANTRIES} from './model.js';
test('narrow curved carriageway and every sign target stay inside mobile and desktop maps',()=>{
 for(const width of [320,390,844,1440]){
  const g=createRoadGeometry(width,2110,LENGTH);assert(g.roadWidth<=width*.4);
  const centers=[];
  for(let x=0;x<=LENGTH;x+=50){centers.push(g.center(x));assert(g.leftAt(x)>0);assert(g.leftAt(x)+g.roadWidth<width);assert(Number.isFinite(g.angleAt(x)));}
  assert(Math.max(...centers)-Math.min(...centers)>20);
  for(const x of GANTRIES){assert(g.leftAt(x)-51>=0);assert(g.project(x)>=20&&g.project(x)<=g.height-20);}
 }
});
test('vehicles and lane-sign tap targets share the same curved coordinates',()=>{
 const g=createRoadGeometry(390,1055,LENGTH);
 for(const x of GANTRIES)for(let lane=0;lane<3;lane++){
  const c={id:1,lane,visualLane:lane,x,length:4.7};
  const sprite=layoutSprites([c],[],{left:0,laneWidth:g.laneWidth,project:g.project,overview:true,laneX:g.laneX,angleAt:g.angleAt})[0];
  assert.equal(sprite.cx,g.leftAt(x)+(lane+.5)*g.laneWidth);assert.equal(sprite.cy,g.project(x));
 }
});
test('detail camera keeps the selected gantry visible while using the same road curve',()=>{
 for(const x of GANTRIES){const g=createRoadGeometry(390,1055,LENGTH,400,x-200);assert(g.project(x)>100&&g.project(x)<950);assert(Math.abs(g.laneX(x,1)-g.center(x))<1e-7);}
});

test('slip-road path stays left of lane 1 and joins continuously',()=>{
 const g=createRoadGeometry(390,1000,10000),r={x:5900};
 for(let d=750;d>=0;d--){const p=slipRoadPoint(g,r,r.x-d);assert(p.x<=g.laneX(r.x-d,0));assert.equal(p.y,g.project(r.x-d));}
 assert.equal(slipRoadPoint(g,r,r.x).x,g.laneX(r.x,0));
 const a=slipRoadPoint(g,r,r.x-120-.001),b=slipRoadPoint(g,r,r.x-120+.001);assert(Math.hypot(a.x-b.x,a.y-b.y)<.01);
});
test('roadwork cones taper across closed lanes with space between every cone',()=>{
 for(const lanes of [[0],[1,2]])for(const length of [10000,400]){
  const g=createRoadGeometry(390,1000,10000,length,3900),w={x:4200,length:150,lanes},cones=roadworkCones(g,w);
  assert(cones.some(p=>p.role==='taper'));assert(cones.some(p=>p.role==='end'));
  assert(Math.max(...cones.map(p=>p.x))-Math.min(...cones.map(p=>p.x))>=g.laneWidth*.9);
  for(let i=0;i<cones.length;i++)for(let j=i+1;j<cones.length;j++)assert(Math.hypot(cones[i].x-cones[j].x,cones[i].y-cones[j].y)>=6);
  assert(cones.some(p=>Math.abs(p.y-g.project(3800))<.001));
 }
});

test('joining curve and pavement meet the motorway with matching tangents',()=>{
 for(const width of [320,390,844])for(const view of [10000,400])for(const x of [1200,5900,9000]){
  const g=createRoadGeometry(width,1055,LENGTH,view,x-200),r={x,mergeLength:600,approachLength:1100};
  const join=slipRoadPoint(g,r,x),outer=slipRoadEdges(g,r,x);
  assert.equal(join.x,g.laneX(x,0));assert(outer.outer>g.leftAt(x));
  assert(Math.abs(join.angle-g.angleAt(x))<1e-7);
  const before=slipRoadPoint(g,r,x-.01),slope=(join.x-before.x)/.01;
  const mainSlope=(g.laneX(x,0)-g.laneX(x-.01,0))/.01;
  assert(Math.abs(slope-mainSlope)<.0001);
  let sawSeparate=false,sawConnected=false;
  for(let d=1100;d>=0;d-=5){
   const p=slipRoadPoint(g,r,x-d),edge=slipRoadEdges(g,r,x-d);
   assert(p.x<=g.laneX(g.unproject(p.y),0)+1e-7);
   assert(Math.abs(Math.hypot(edge.innerPoint.x-edge.outerPoint.x,edge.innerPoint.y-edge.outerPoint.y)-g.laneWidth*.45)<1e-7);assert(Number.isFinite(p.angle));
   if(edge.connected)sawConnected=true;else sawSeparate=true;
  }
  assert(sawSeparate&&sawConnected);
  const a=slipRoadPoint(g,r,x-600-.001),b=slipRoadPoint(g,r,x-600+.001);
  assert(Math.abs(a.angle-b.angle)<.0001);
 }
});


test('road drawing and touch coordinates share a fixed reversible projection',()=>{
 for(const width of [320,390])for(const [view,start] of [[LENGTH,0],[400,2400]]){
  const g=createRoadGeometry(width,1055,LENGTH,view,start);
  for(let x=0;x<=LENGTH;x+=25){
   assert(Math.abs(g.unproject(g.project(x))-x)<1e-7);
   assert(Math.abs(g.centerAtY(g.project(x))-g.center(x))<1e-7);
   assert(g.scaleAt(x)>0&&Number.isFinite(g.angleAt(x)));
  }
 }
});
test('road shape, junctions and gantries stay fixed while traffic queues and clears',()=>{
 let seed=73;const sim=new Simulation(()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296));
 sim.cars=[];sim.incidents=[];sim.systemsEnabled=false;sim.nextArrival=sim.nextIncident=sim.nextEmergency=Infinity;sim.waiting=0;
 for(const signal of sim.signals[0])signal.mode='closed';
 for(let lane=0;lane<3;lane++)for(let n=0;n<20;n++)sim.spawn(lane,420-n*20,12);
 const args=[390,1055,LENGTH],positions=[0,...GANTRIES,1200,5900,9000,LENGTH];
 const coordinates=g=>positions.map(x=>[g.center(x),g.leftAt(x),g.project(x),g.angleAt(x),...([1200,5900,9000].includes(x)?Object.values(slipRoadPoint(g,{x,mergeLength:600},x-300)):[])]);
 const before=coordinates(createRoadGeometry(...args));
 for(let n=0;n<500;n++){sim.step(.1);if(n%50===0)assert.deepEqual(coordinates(createRoadGeometry(...args)),before);}
 assert(sim.cars.some(c=>c.v<.5),'fixture did not create a stopped queue');
 sim.cars=[];sim.incidents=[];
 assert.deepEqual(coordinates(createRoadGeometry(...args)),before);
});
test('off ramps diverge smoothly into a deceleration lane before the exit',()=>{
 const g=createRoadGeometry(420,1200,10000),r=new Simulation(()=>.5).systems.ramps[1],x=r.offStart;
 const start=offRampPoint(g,r,x),near=offRampPoint(g,r,x+.001),end=offRampPoint(g,r,x+r.offLength);
 assert.equal(start.x,g.laneX(x,0));assert(Math.abs(near.angle-start.angle)<.0001);
 assert(end.x<g.leftAt(x+r.offLength));assert.equal(end.y,g.project(x+r.offLength));
});
test('slip roads stay gradual and exits precede entries without crossing',async()=>{
 const {offRampPoint}=await import('./road.js');
 for(const width of [320,390,844,1440]){
  const s=new Simulation(()=>.5),g=createRoadGeometry(width,2400,LENGTH);
  for(const r of s.systems.ramps){
   assert(r.offStart+r.offLength>0);assert(r.offStart+r.offLength<r.x-r.mergeLength);
   for(let n=0;n<=1000;n++){
    const x=r.offStart+r.offLength*n/1000,exit=offRampPoint(g,r,x),entry=slipRoadPoint(g,r,x);
    assert(entry.x<exit.x-g.laneWidth*.45,'slip roads cross or overlap');
    for(const [p,pointX] of [[exit,x],[slipRoadPoint(g,r,r.x-r.approachLength*n/1000),r.x-r.approachLength*n/1000]]){
     assert.equal(p.y,g.project(pointX));
     assert(Math.abs(p.angle-g.angleAt(pointX))<Math.PI*.46,'slip road turns across the motorway');
    }
   }
  }
 }
});
test('acceleration and deceleration sections run parallel beside the motorway',()=>{
 for(const width of [320,390,844,1440]){
  const g=createRoadGeometry(width,2400,LENGTH),r=new Simulation(()=>.5).systems.ramps[1];
  const on=[r.x-r.mergeLength+20,r.x-r.joinTaper-20].map(x=>slipRoadPoint(g,r,x).x-g.leftAt(x));
  const off=[r.offStart+r.offDeparture+20,r.offStart+r.offLength*.6-20].map(x=>offRampPoint(g,r,x).x-g.leftAt(x));
  assert(Math.abs(on[0]-on[1])<1e-7);assert(Math.abs(off[0]-off[1])<1e-7);assert(on[0]<0&&off[0]<0);
 }
});
test('junction steering can finish smoothly while longitudinal position is held in a queue',()=>{
 const g=createRoadGeometry(390,1200,LENGTH),r=new Simulation(()=>.5).systems.ramps[0],x=900;
 let before=-Infinity;
 for(const t of [0,.25,.5,.75,1]){
  const p=slipRoadPoint(g,r,x,{rampMerging:true,rampMergeStart:600,rampSteerProgress:t,rampSteerDuration:4.5,v:0});
  assert(p.x>=before);assert.equal(p.y,g.project(x));assert(Math.abs(p.angle-g.angleAt(x))<=.3000001);before=p.x;
 }
 assert.equal(before,g.laneX(x,0));
});
