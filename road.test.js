import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoadGeometry,slipRoadPoint,roadworkCones} from './road.js';
import {layoutSprites} from './display.js';
import {LENGTH,GANTRIES} from './model.js';
test('narrow curved carriageway and every sign target stay inside mobile and desktop maps',()=>{
 for(const width of [320,390,844,1440]){
  const g=createRoadGeometry(width,1055,LENGTH);assert(g.roadWidth<=width*.4);
  const centers=[];
  for(let x=0;x<=LENGTH;x+=50){centers.push(g.center(x));assert(g.leftAt(x)>0);assert(g.leftAt(x)+g.roadWidth<width);assert(Number.isFinite(g.angleAt(x)));}
  assert(Math.max(...centers)-Math.min(...centers)>20);
  for(const x of GANTRIES){assert(g.leftAt(x)-51>=0);assert(g.project(x)>=20&&g.project(x)<=1035);}
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
