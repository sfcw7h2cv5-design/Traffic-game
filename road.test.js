import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoadGeometry} from './road.js';
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
