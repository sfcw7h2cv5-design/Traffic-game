import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from './model.js';
function seeded(seed=19){let n=seed;return()=>((n=(n*1664525+1013904223)>>>0)/4294967296);}
function setup(){const s=new Simulation(seeded());s.cars=[];s.incidents=[];s.systemsEnabled=false;s.nextArrival=s.nextEmergency=s.nextIncident=Infinity;s.waiting=0;return s;}
function step(s,n=1){for(let i=0;i<n;i++)s.step(.1);}
function loaded(s){
 const incident=s.addIncident(0,2200,'breakdown');s.dispatchRecovery(incident);
 const tow=s.cars.find(c=>c.kind==='recovery');
 Object.assign(tow,{x:incident.x-25,v:0,recovering:incident.id});
 incident.status='recovering';incident.clearsAt=s.elapsed+.1;
 step(s);return tow;
}
function separated(s){
 const bodies=[...s.cars,...s.incidentBodies()];
 for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
  const a=bodies[i],b=bodies[j];if(!s.occupiedLanes(a).some(l=>s.occupiedLanes(b).includes(l)))continue;
  const front=a.x>=b.x?a:b,back=front===a?b:a;assert(front.x-front.length-back.x>=1.99);
 }
}
test('a completed recovery rejoins the motorway smoothly and remains normal traffic',()=>{
 const s=setup(),tow=loaded(s),length=tow.length,start=tow.x;
 assert(tow.towing);assert.equal(tow.recoveryTarget,null);assert(tow.needsRoadRejoin);
 step(s);assert.equal(tow.lane,0);assert.equal(tow.fromLane,-1);assert(tow.visualLane<0);assert(tow.laneChange);
 let previous=tow.x,previousLane=tow.visualLane;
 for(let n=0;n<100;n++){
  step(s);assert(tow.x>=previous);assert(tow.x-previous<4);assert(tow.visualLane>=previousLane);assert.equal(tow.length,length);separated(s);
  previous=tow.x;previousLane=tow.visualLane;
 }
 assert(tow.x>start);assert.equal(tow.visualLane,0);assert.equal(tow.laneChange,null);assert(!tow.needsRoadRejoin);
 step(s,300);assert(tow.lane>=0);assert.equal(tow.recoveryTarget,null);
});
test('a returning recovery truck gives way to fast motorway traffic without slowing it',()=>{
 const s=setup(),tow=loaded(s),start=tow.x;
 const priority=s.spawn(0,start-45,30);Object.assign(priority,{truck:false,length:4.7,desired:30,cooldown:Infinity});
 const control=setup();control.cars=[{...priority}];
 for(let n=0;n<10;n++){step(s);step(control);assert.equal(tow.lane,-1);assert.equal(tow.x,start);assert.equal(priority.x,control.cars[0].x);assert.equal(priority.v,control.cars[0].v);separated(s);}
 for(let n=0;n<120;n++){const x=tow.x;step(s);assert(tow.x>=x);separated(s);}
 assert.equal(tow.lane,0);assert.equal(tow.visualLane,0);
});
test('finished recovery waits on the shoulder until the running lane is legal and clear',()=>{
 const s=setup(),tow=loaded(s),start=tow.x;
 s.signals[1][0].mode='closed';step(s,100);assert.equal(tow.lane,-1);assert.equal(tow.x,start);assert.equal(tow.v,0);
 s.signals[1][0].mode='open';const alongside=s.spawn(0,start,0);Object.assign(alongside,{desired:.01,cooldown:Infinity});
 step(s,10);assert.equal(tow.lane,-1);assert.equal(tow.x,start);separated(s);
 s.cars=s.cars.filter(c=>c!==alongside);step(s,60);assert.equal(tow.lane,0);assert.equal(tow.visualLane,0);
});
test('recovery trucks use the shoulder only on the active approach and ordinary trucks obey motorway limits',()=>{
 const s=setup(),incident=s.addIncident(0,2200,'breakdown');s.dispatchRecovery(incident);
 const tow=s.cars.find(c=>c.kind==='recovery');step(s,100);assert.equal(tow.lane,-1);assert.equal(tow.recoveryTarget,incident.id);assert(tow.x>0);
 const normal=setup(),idle=normal.spawn(0,3900,24,'recovery');idle.cooldown=Infinity;normal.signals[3][0].speed=30;
 step(normal,200);assert.equal(idle.lane,0);assert(idle.v<15);assert.equal(idle.recoveryTarget,undefined);
});
test('a recovery truck whose job disappears returns to ordinary traffic',()=>{
 const s=setup(),incident=s.addIncident(0,2200,'breakdown');s.dispatchRecovery(incident);
 const tow=s.cars.find(c=>c.kind==='recovery');s.incidents=[];step(s,60);
 assert.equal(tow.recoveryTarget,null);assert.equal(tow.recovering,null);assert.equal(tow.lane,0);assert.equal(tow.visualLane,0);
});
test('a merge advisory still permits a safe rejoin before ordinary lane guidance applies',()=>{
 const s=setup(),tow=loaded(s);s.signals[1][0].mode='merge-right';
 step(s);assert.equal(tow.lane,0);assert.equal(tow.fromLane,-1);assert(tow.laneChange);
 for(let n=0;n<120;n++){const x=tow.x;step(s);assert(tow.x>=x);separated(s);}
 assert(tow.lane>=0);assert(!tow.needsRoadRejoin);
});
