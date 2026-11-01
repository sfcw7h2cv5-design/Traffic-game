import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from './model.js';
function seeded(seed=17){let n=seed;return()=>((n=(n*1664525+1013904223)>>>0)/4294967296);}
function setup(){
 const s=new Simulation(seeded());s.cars=[];s.incidents=[];s.nextArrival=s.nextEmergency=s.nextIncident=Infinity;s.waiting=0;
 s.systems.work.announceAt=s.systems.work.startsAt=Infinity;s.systems.roadblock.startsAt=Infinity;
 s.systems.phase.endsAt=Infinity;for(const r of s.systems.ramps)r.nextArrival=Infinity;
 return s;
}
function run(s,seconds){for(let i=0;i<seconds*10;i++)s.step(.1);}
function queuedCar(s,r){const c=s.spawn(0,r.x,0);s.cars.pop();c.rampApproach=1;r.queue.push(c);return c;}
test('red ramp holds actual vehicles; green releases them through a safe gap',()=>{
 const s=setup(),r=s.systems.ramps[0];const c=queuedCar(s,r);
 s.systems.setRampMode(0,'red');run(s,10);assert(r.queue.includes(c));assert(!s.cars.includes(c));
 s.systems.setRampMode(0,'green');run(s,.1);assert(s.cars.includes(c));assert.equal(c.onRamp,0);assert.equal(r.joined,1);
 run(s,4);assert.equal(c.onRamp,null);assert(c.x>r.x);
});
test('green ramp cannot insert a vehicle into occupied traffic or a closing lane',()=>{
 const s=setup(),r=s.systems.ramps[0];const c=queuedCar(s,r);r.mode='green';
 s.spawn(0,r.x,0);run(s,.1);assert(r.queue.includes(c));
 s.cars=[];s.signals[1][0].mode='closed';run(s,.1);assert(r.queue.includes(c));
});
test('automatic ramp metering spaces releases without deleting queue vehicles',()=>{
 const s=setup(),r=s.systems.ramps[0];r.mode='auto';const first=queuedCar(s,r),second=queuedCar(s,r);
 run(s,.1);assert(s.cars.includes(first));assert(r.queue.includes(second));run(s,3);assert(r.queue.includes(second));
 run(s,15);assert(s.cars.includes(second));assert.equal(r.joined,2);
});
test('roadworks wait for protected empty lanes, pause if protection is removed, then finish once',()=>{
 const s=setup(),o=s.systems,w=o.work;w.announceAt=0;w.startsAt=0;w.remaining=4;
 run(s,.1);assert.equal(w.status,'awaiting-protection');assert.equal(w.sceneId,null);
 o.protectWorks();const g=o.protectionGantry();assert.equal(s.signals[g][0].mode,'closed');
 const car=s.spawn(0,w.x-30,0);run(s,.1);assert.equal(w.sceneId,null);
 s.cars=[];run(s,.1);assert.equal(w.status,'working');assert(s.incidents.some(i=>i.type==='roadworks'));
 const left=w.remaining;s.signals[g][0].mode='open';run(s,2);assert.equal(w.status,'safety-paused');assert.equal(w.remaining,left);
 s.signals[g][0].mode='closed';run(s,5);assert.equal(w.status,'complete');assert.equal(o.completedWorks,1);
 assert(!s.incidents.some(i=>i.type==='roadworks'));run(s,5);assert.equal(o.completedWorks,1);
 assert.equal(s.signals[g][0].mode,'closed');assert(o.objectives.find(i=>i.id==='works').complete);
});
test('police rolling block uses three real vehicles, only deploys crews into an empty zone, and releases',()=>{
 const s=setup(),o=s.systems,b=o.roadblock;b.startsAt=0;
 const occupant=s.spawn(0,b.x-20,0);occupant.desired=.01;occupant.cooldown=Infinity;occupant.decision=Infinity;
 run(s,.1);assert.equal(b.vehicleIds.length,3);assert.equal(b.status,'rolling');
 for(const id of b.vehicleIds)assert(s.cars.find(c=>c.id===id).desired<10);
 s.cars=s.cars.filter(c=>c.id!==occupant.id);run(s,.1);assert.equal(b.status,'clearing');
 assert(s.incidents.some(i=>i.type==='police-clearance'&&i.bodies.length===3));
 run(s,25);assert.equal(b.status,'complete');assert(!s.incidents.some(i=>i.type==='police-clearance'));
 for(const id of b.vehicleIds){const c=s.cars.find(c=>c.id===id);assert(c.emergency);assert(!c.blocker);assert(c.desired>45);}
});
test('automatic rush hour and stadium surges change demand without user scenario selection',()=>{
 const s=setup(),o=s.systems;o.phase.endsAt=0;run(s,.1);assert.equal(o.phase.name,'Morning rush');assert(o.phase.multiplier>1);
 o.phase.endsAt=0;run(s,.1);assert.equal(o.phase.name,'Demand easing');
 o.phase.endsAt=0;run(s,.1);assert.equal(o.phase.name,'Stadium traffic');assert(o.phase.multiplier>=2);
});
test('optional shift goals track real exits and cleared queues without ending the simulation',()=>{
 const s=setup(),o=s.systems;s.spawn(2,9999,35,'ambulance');run(s,1);
 assert(o.objectives.find(x=>x.id==='ambulance').complete);assert.equal(o.totalExited,1);
 s.cars=[];for(let i=0;i<5;i++){const c=s.spawn(0,3000+i*25,0);c.desired=.01;c.cooldown=Infinity;c.decision=Infinity;}
 run(s,.1);assert(o.queueSeen);s.cars=[];run(s,22);
 assert(o.objectives.find(x=>x.id==='queue').complete);const time=s.elapsed;run(s,2);assert(s.elapsed>time);
});
test('new junctions and scheduled operations maintain separation and forward motion together',()=>{
 const s=new Simulation(seeded(73));s.nextIncident=s.nextEmergency=Infinity;
 for(let n=0;n<2200;n++){
  if(n===1500)s.systems.protectWorks();
  const before=new Map(s.cars.map(c=>[c.id,c.x]));s.step(.1);
  for(const c of s.cars)if(before.has(c.id))assert(c.x>=before.get(c.id)-1e-7,'backwards '+c.id);
  const bodies=[...s.cars,...s.incidentBodies()];
  for(let a=0;a<bodies.length;a++)for(let b=a+1;b<bodies.length;b++){
   const x=bodies[a],y=bodies[b];if(!s.occupiedLanes(x).some(l=>s.occupiedLanes(y).includes(l)))continue;
   const front=x.x>=y.x?x:y,back=front===x?y:x;assert(front.x-front.length-back.x>=1.99,'overlap '+front.id+'/'+back.id);
  }
 }
 assert(s.systems.ramps.some(r=>r.joined>0));assert(s.systems.phase.name!=='Normal demand');
});
test('work crews never deploy onto an unresolved incident inside their zone',()=>{
 const s=setup(),o=s.systems,w=o.work;w.announceAt=w.startsAt=0;o.protectWorks();
 s.incidents=[{id:999,type:'breakdown',lane:0,x:w.x-30,length:5,clearsAt:Infinity,status:'recovering'}];
 run(s,.1);assert.equal(w.sceneId,null);assert.equal(w.status,'awaiting-protection');
 s.incidents=[];run(s,.1);assert.equal(w.status,'working');
});
test('later two-lane work plans send both upstream arrows toward the remaining open lane',()=>{
 const s=setup(),o=s.systems;o.work={...o.work,x:7200,lanes:[1,2]};o.protectWorks();
 const g=o.protectionGantry();assert.equal(s.signals[g][1].mode,'closed');assert.equal(s.signals[g][2].mode,'closed');
 assert.equal(s.signals[g-1][1].mode,'merge-left');assert.equal(s.signals[g-1][2].mode,'merge-left');
});
