import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,GANTRIES} from './model.js';
function seeded(seed=17){let n=seed;return()=>((n=(n*1664525+1013904223)>>>0)/4294967296);}
function setup(){
 const s=new Simulation(seeded());s.cars=[];s.incidents=[];s.nextArrival=s.nextEmergency=s.nextIncident=Infinity;s.waiting=0;
 s.systems.work.announceAt=s.systems.work.startsAt=Infinity;s.systems.roadblock.startsAt=Infinity;
 s.systems.phase.endsAt=Infinity;for(const r of s.systems.ramps)r.nextArrival=Infinity;
 return s;
}
function run(s,seconds){for(let i=0;i<seconds*10;i++)s.step(.1);}
function queuedCar(s,r){const d=r.queue.length?r.queue.at(-1).rampDistance+r.queue.at(-1).length+8:r.mergeLength;const c=s.spawn(0,r.x-d,0);s.cars.pop();c.rampDistance=d;c.slipRamp=r.id;r.queue.push(c);return c;}
test('closed slip road holds vehicles; open releases through a safe gap',()=>{
 const s=setup(),r=s.systems.ramps[0];const c=queuedCar(s,r);
 s.systems.setRampMode(0,'closed');run(s,10);assert(r.queue.includes(c));assert(!s.cars.includes(c));
 s.systems.setRampMode(0,'open');run(s,.1);assert(s.cars.includes(c));assert.equal(c.onRamp,0);assert.equal(r.joined,1);
 run(s,90);assert.equal(c.onRamp,null);assert(c.x>r.x);
});
test('open slip road waits for physical traffic and obstructions at the joining point',()=>{
 const s=setup(),r=s.systems.ramps[0];const c=queuedCar(s,r);r.mode='open';
 s.spawn(0,r.x-r.mergeLength,0);run(s,.1);assert(r.queue.includes(c));
 s.cars=[];s.incidents=[{id:999,type:'debris',lane:0,x:r.x-r.mergeLength,length:5,clearsAt:Infinity}];run(s,.1);assert(r.queue.includes(c));
 s.incidents=[];run(s,.1);assert(s.cars.includes(c));assert.equal(r.joined,1);
});
test('slip-road drivers wait for a safe gap without deleting queue vehicles',()=>{
 const s=setup(),r=s.systems.ramps[0];r.mode='open';const first=queuedCar(s,r),second=queuedCar(s,r);
 run(s,.1);assert(s.cars.includes(first));assert(r.queue.includes(second));run(s,3);assert(r.queue.includes(second));
 run(s,35);assert(s.cars.includes(second));assert.equal(r.joined,2);
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

test('slip roads default open and approach vehicles move continuously at physical speed',()=>{
 const s=setup(),r=s.systems.ramps[0];assert.equal(r.mode,'open');assert.equal(s.systems.setRampMode(0,'auto'),false);
 r.nextArrival=0;run(s,.1);const c=r.queue[0];assert(c);r.nextArrival=Infinity;let before=c.x;
 for(let i=0;i<700;i++){s.step(.1);assert(c.x>=before);assert(c.x-before<4);before=c.x;if(c.onRamp!=null)assert(c.rampProgress>=0&&c.rampProgress<=1);}
 assert(s.cars.includes(c));assert.equal(c.onRamp,null);assert.equal(r.queue.length,0);
});

function assertSafeStep(s,lengths){
 const before=new Map(s.cars.map(c=>[c.id,c.x]));s.step(.1);
 for(const c of s.cars){
  if(before.has(c.id)){assert(c.x>=before.get(c.id)-1e-7,'vehicle moved backwards');assert(c.x-before.get(c.id)<4,'vehicle teleported');}
  if(lengths.has(c.id))assert.equal(c.length,lengths.get(c.id),'vehicle changed size');
 }
 const bodies=[...s.cars,...s.incidentBodies()];
 for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
  const a=bodies[i],b=bodies[j];if(!s.occupiedLanes(a).some(l=>s.occupiedLanes(b).includes(l)))continue;
  const front=a.x>=b.x?a:b,back=front===a?b:a;
  assert(front.x-front.length-back.x>=1.99,'vehicles overlapped');
 }
}
test('all open slip roads join and leave lane 1 for current or approaching closures and arrows',()=>{
 for(const rampId of [0,1,2])for(const mode of ['closed','merge-right'])for(const approach of [false,true]){
  const s=setup(),r=s.systems.ramps[rampId],entry=r.x-r.mergeLength;
  const g=approach?GANTRIES.findIndex(x=>x>entry):GANTRIES.findLastIndex(x=>x<=entry);
  if(g<0)continue;
  s.signals[g][0].mode=mode;
  const c=queuedCar(s,r),traffic=s.spawn(1,r.x+150,20);
  const lengths=new Map([c,traffic].map(v=>[v.id,v.length]));let escaped=false;
  for(let n=0;n<900;n++){assertSafeStep(s,lengths);if(c.onRamp==null&&c.lane===1){escaped=true;break;}}
  assert.equal(r.joined,1,r.name+' did not release for '+mode);
  assert.equal(r.queue.length,0);
  assert(escaped,r.name+' failed to merge for '+(approach?'upcoming ':'current ')+mode);
 }
});
test('slip-road traffic can traverse two adjacent closures into the remaining open lane',()=>{
 for(const rampId of [0,1,2]){
  const s=setup(),r=s.systems.ramps[rampId],current=GANTRIES.findLastIndex(x=>x<=r.x-r.mergeLength);
  for(let g=current;g<GANTRIES.length;g++)for(const lane of [0,1])s.signals[g][lane].mode='closed';
  const c=queuedCar(s,r),traffic=s.spawn(2,r.x+180,20);
  const lengths=new Map([c,traffic].map(v=>[v.id,v.length]));let escaped=false;
  for(let n=0;n<1000;n++){assertSafeStep(s,lengths);if(c.onRamp==null&&c.lane===2&&Math.abs(c.visualLane-2)<.02){escaped=true;break;}}
  assert.equal(r.joined,1);assert(escaped,r.name+' failed to reach lane 3');assert(s.cars.includes(c));
 }
});
test('the slip-road emergency closure still holds independently of motorway signs',()=>{
 for(const rampId of [0,1,2]){
  const s=setup(),r=s.systems.ramps[rampId],c=queuedCar(s,r),start=c.x;
  for(const signs of s.signals)signs[0].mode='closed';
  s.systems.setRampMode(rampId,'closed');run(s,10);
  assert(r.queue.includes(c));assert.equal(c.x,start);assert.equal(r.joined,0);assert(!s.cars.includes(c));
  s.systems.setRampMode(rampId,'open');run(s,.1);assert.equal(r.joined,1);assert(s.cars.includes(c));
 }
});
test('an actual work zone overlapping any part of the joining taper holds slip-road traffic',()=>{
 const s=setup(),r=s.systems.ramps[0],c=queuedCar(s,r);
 s.incidents=[{id:999,type:'roadworks',lane:0,x:r.x+350,length:500,clearsAt:Infinity}];
 run(s,5);assert(r.queue.includes(c));assert.equal(r.joined,0);assert(!s.cars.includes(c));
 s.incidents=[];run(s,.1);assert(s.cars.includes(c));assert.equal(r.joined,1);
});
test('incidents behind or beyond the joining taper do not act as slip-road stop signs',()=>{
 for(const behind of [true,false]){
  const s=setup(),r=s.systems.ramps[0],c=queuedCar(s,r),offset=behind?-r.mergeLength-50:30;
  s.incidents=[{id:999,type:'debris',lane:0,x:r.x+offset,length:5,clearsAt:Infinity}];
  run(s,.1);assert(s.cars.includes(c));assert.equal(r.joined,1);assert.equal(r.queue.length,0);
 }
});
test('all-lane closures hold the slip road until an onward motorway lane reopens',()=>{
 for(const rampId of [0,1,2])for(const approaching of [false,true]){
  const s=setup(),r=s.systems.ramps[rampId];
  const g=approaching?GANTRIES.findIndex(x=>x>r.x):GANTRIES.findLastIndex(x=>x<=r.x);
  if(g<0)continue;
  for(const signal of s.signals[g])signal.mode='closed';
  const c=queuedCar(s,r);run(s,5);assert(r.queue.includes(c));assert.equal(r.joined,0);
  s.signals[g][1].mode='open';run(s,.1);assert(s.cars.includes(c));assert.equal(r.joined,1);
 }
});

test('the extended slip-road join reserves its full corridor and progress follows physical distance',()=>{
 const s=setup(),r=s.systems.ramps[0],c=queuedCar(s,r),length=c.length,entry=r.x-r.mergeLength;
 assert.equal(r.mergeLength,600);assert.equal(r.approachLength,1100);
 run(s,.1);assert(s.cars.includes(c));assert.equal(c.onRamp,r.id);assert(c.x>=entry&&c.x-entry<4);
 let before=c.x,joined=false;
 for(let n=0;n<1000;n++){
  s.step(.1);assert(c.x>=before);assert(c.x-before<4);assert.equal(c.length,length);
  if(c.onRamp!=null){assert(c.x<r.x+4);assert(Math.abs(c.rampProgress-(before-entry)/r.mergeLength)<1e-9);}
  else{assert(c.x>=r.x);joined=true;break;}
  before=c.x;
 }
 assert(joined);
});

test('work crews respect a vehicle still travelling through the longer joining corridor',()=>{
 const s=setup(),o=s.systems,r=o.ramps[0],c=queuedCar(s,r);run(s,.1);
 c.x=r.x-300;c.v=10;
 o.work={...o.work,x:r.x-100,announceAt:0,startsAt:0};
 o.protectWorks();run(s,.1);
 assert.equal(c.onRamp,r.id);assert.equal(o.work.sceneId,null);assert.equal(o.work.status,'awaiting-protection');
 s.cars=[];run(s,.1);assert.equal(o.work.status,'working');
});
