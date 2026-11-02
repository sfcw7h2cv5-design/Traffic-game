import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from './model.js';
function seeded(seed=17){let n=seed;return()=>((n=(n*1664525+1013904223)>>>0)/4294967296);}
function setup(seed=17){
 const s=new Simulation(seeded(seed));s.cars=[];s.incidents=[];s.waiting=0;s.nextArrival=s.nextIncident=s.nextEmergency=Infinity;
 const o=s.systems;o.work.announceAt=o.work.startsAt=o.roadblock.startsAt=o.phase.endsAt=Infinity;
 for(const r of o.ramps)r.nextArrival=Infinity;
 return s;
}
function arrival(s,r,distance,v=25){
 const c=s.spawn(0,r.x-r.mergeLength-distance,v);s.cars.pop();
 Object.assign(c,{truck:false,length:4.7,desired:25,courtesy:1,headway:2.7,acceleration:1.4,v,rampDistance:r.mergeLength+distance,slipRamp:r.id});r.queue.push(c);return c;
}
function safe(s,before){
 for(const c of s.cars)if(before?.has(c.id))assert(c.x>=before.get(c.id)-1e-7,'mainline vehicle moved backwards');
 const bodies=[...s.cars,...s.incidentBodies()];
 for(const lane of [-1,0,1,2]){
  const cars=bodies.filter(c=>s.occupiedLanes(c).includes(lane)).sort((a,b)=>b.x-a.x);
  for(let i=1;i<cars.length;i++)assert(cars[i-1].x-cars[i-1].length-cars[i].x>=1.99,'overlap in lane '+lane);
 }
 for(const r of s.systems.ramps)for(let i=1;i<r.queue.length;i++)assert(r.queue[i].rampDistance-r.queue[i-1].rampDistance-r.queue[i-1].length>=4.99,'slip-road queue overlap');
}
test('gap arrival prediction accounts for both acceleration and braking distance',()=>{
 const s=setup(),o=s.systems;
 assert.deepEqual(o.rampArrival({v:25,acceleration:1.4},200,25),{time:8,speed:25});
 const slowing=o.rampArrival({v:30,acceleration:1.4},10,10);
 assert(slowing.speed>29&&slowing.time<.4,'forecast unrealistically reached a low target before the give-way point');
 const speeding=o.rampArrival({v:10,acceleration:1},50,30);
 assert(speeding.speed<15&&speeding.time>4,'forecast assumed instant acceleration');
});
test('a matched arrival keeps moving throughout the whole joining taper',()=>{
 const s=setup(),r=s.systems.ramps[0],entry=r.x-r.mergeLength,c=arrival(s,r,200,25);
 const front=s.spawn(0,entry-155,25);Object.assign(front,{truck:false,length:4.7,desired:25,v:25,courtesy:1,cooldown:Infinity,decision:Infinity});
 let joined=false,finished=false,minimum=25,worst=0;
 for(let n=0;n<1000;n++){
  const before=new Map(s.cars.map(c=>[c.id,c.x]));s.step(.1);safe(s,before);
  if(s.cars.includes(c)){joined=true;minimum=Math.min(minimum,c.v);worst=Math.min(worst,c.a);}
  assert(front.v>24.9,'the priority vehicle braked for the arrival');
  if(joined&&c.onRamp==null){finished=true;break;}
 }
 assert(joined&&finished);assert(minimum>20,'matched entry collapsed into a stop inside the taper');
 assert(worst>-1,'gap matching produced sudden braking');assert.equal(c.headway,2.7,'temporary merge following changed the driver permanently');
});
test('courtesy gap requests are modest, stable and expire with the ramp closure',()=>{
 const s=setup(),o=s.systems,r=o.ramps[0],entry=r.x-r.mergeLength;
 arrival(s,r,100,10);
 const front=s.spawn(0,entry+50,25),rear=s.spawn(0,entry-200,25);
 for(const c of [front,rear])Object.assign(c,{truck:false,length:4.7,desired:25,v:25,courtesy:1,cooldown:Infinity,decision:Infinity});
 o.updateRampCourtesy();
 assert.equal(rear.rampYieldId,r.id);assert.equal(rear.rampYieldEntry,entry);assert.equal(rear.rampYieldTargetSpeed,22.5);
 assert.equal(front.rampYieldId,undefined,'a vehicle ahead was asked to make room');
 rear.v=24;o.updateRampCourtesy();assert.equal(rear.rampYieldTargetSpeed,22.5,'courtesy target ratcheted down towards a stop');
 o.setRampMode(r.id,'closed');o.updateRampCourtesy();assert.equal(rear.rampYieldUntil,undefined);
});
test('courtesy does not disturb priority traffic when a rolling gap is already reachable',()=>{
 const s=setup(),o=s.systems,r=o.ramps[0],entry=r.x-r.mergeLength,c=arrival(s,r,200,20);
 c.desired=31;
 const priority=s.spawn(0,entry-250,30);Object.assign(priority,{truck:false,length:4.7,desired:30,v:30,courtesy:1,cooldown:Infinity,decision:Infinity});
 for(let n=0;n<200&&!s.cars.includes(c);n++){
  s.step(.1);assert(priority.v>29.9);assert.equal(priority.rampYieldId,undefined);
 }
 assert(s.cars.includes(c));
});
test('repeated rush-hour arrivals use moving gaps without building unnecessary stopped queues',()=>{
 for(const seed of [17,73,123]){
  const s=new Simulation(seeded(seed));s.nextEmergency=s.nextIncident=Infinity;
  const o=s.systems;o.work.announceAt=o.work.startsAt=o.roadblock.startsAt=o.phase.endsAt=Infinity;o.phase.multiplier=1.8;
  const seen=new Set(),stopped=new Set();let stoppedSeconds=0;
  for(let n=0;n<2400;n++){
   const before=new Map(s.cars.map(c=>[c.id,c.x]));s.step(.1);safe(s,before);
   for(const r of o.ramps)for(const c of r.queue){seen.add(c.id);if(c.v<.5){stopped.add(c.id);stoppedSeconds+=.1;}}
  }
  const joined=o.ramps.reduce((sum,r)=>sum+r.joined,0);
  assert(joined>=seen.size*.75,'too few arrivals joined: '+JSON.stringify({seed,joined,arrivals:seen.size}));
  assert(stopped.size<seen.size*.5,'most arrivals had to stop: '+JSON.stringify({seed,stopped:stopped.size,arrivals:seen.size}));
  assert(stoppedSeconds<200,'junction queue did not clear: '+JSON.stringify({seed,stoppedSeconds}));
 }
});
