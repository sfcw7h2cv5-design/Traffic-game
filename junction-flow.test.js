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
 for(const lane of new Set([-1,0,1,2,...s.cars.flatMap(c=>s.occupiedLanes(c))])){
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
 const s=setup(),o=s.systems,r=o.ramps[0],entry=r.x-r.joinTaper;
 const merger=s.spawn(0,entry-100,10);Object.assign(merger,{onRamp:r.id,rampMerging:false,slipRamp:r.id,desired:25});
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
test('J2 takes turns at the actual merge, with lane 1 open or closed',()=>{
 for(const closed of [false,true]){
  const s=setup(),o=s.systems,r=o.ramps[1],point=r.x-r.joinTaper;
  if(closed)for(const row of s.signals)row[0].mode='closed';
  const c=s.spawn(0,point-2,0);Object.assign(c,{onRamp:r.id,slipRamp:r.id,rampMerging:false,truck:false,length:4.7});
  const rear=s.spawn(0,point-65,5);Object.assign(rear,{truck:false,length:4.7,cooldown:Infinity,decision:Infinity});
  o.updateZipper();assert(rear.zipperYieldTarget>0&&rear.zipperYieldTarget<rear.v);assert(s.obstacle(rear,0).gap>700);
  rear.x=point-c.length-14;rear.v=0;o.prepareRampMerges(.1);
  assert(c.rampMerging);assert.equal(r.zipperTurn,'main');
  c.x=point+40;
  const next=s.spawn(0,point-40,0);Object.assign(next,{onRamp:r.id,slipRamp:r.id,rampMerging:false});
  o.updateZipper();assert.equal(rear.zipperYieldTarget,undefined);assert.equal(r.zipperMain,rear.id);
  rear.x=point+1;o.updateZipper();assert.equal(r.zipperTurn,'ramp');
  for(let n=0;n<1800&&s.cars.includes(c)&&c.x<r.x+100;n++){s.step(.1);safe(s);}
  assert(c.x>r.x);if(closed)assert(c.lane>0);
 }
});
test('speed anticipation is continuous across 400 m and respects the posted limit downstream',()=>{
 const s=setup();s.signals[1][0].speed=20;
 const a=s.speedTarget({x:1549-400,lane:0}),b=s.speedTarget({x:1551-400,lane:0});
 assert(Math.abs(a-b)<.1,'braking target jumps at 400 m');
 assert.equal(s.speedTarget({x:1550,lane:0}),20*.44704);
});
test('settled traffic follows an exit branch continuously and is counted once',()=>{
 const s=setup(),o=s.systems,r=o.ramps[1];
 while(s.id%7)s.id++;
 const c=s.spawn(0,r.offStart+1,20);Object.assign(c,{truck:false,length:4.7,desired:25,cooldown:Infinity,decision:Infinity});
 o.updateOffRamps();assert.equal(c.offRamp,r.id);let before=c.x;
 for(let n=0;n<600&&s.cars.includes(c);n++){s.step(.1);assert(c.x>=before);assert(c.x-before<4);before=c.x;}
 assert(!s.cars.includes(c));assert.equal(o.totalExited,1);assert.equal(s.exits.length,1);
 o.updateOffRamps();assert.equal(o.totalExited,1);
});
test('the parallel acceleration lane admits traffic alongside an occupied motorway lane',()=>{
 const s=setup(),r=s.systems.ramps[1],entry=r.x-r.mergeLength,c=arrival(s,r,0,25);
 const main=s.spawn(0,entry,25);Object.assign(main,{truck:false,length:4.7,desired:25,v:25,courtesy:1,cooldown:Infinity,decision:Infinity});
 s.step(.1);assert(s.cars.includes(c));assert(!s.occupiedLanes(c).includes(0));assert.equal(s.obstacle(main,0).gap,Infinity);
 for(let n=0;n<40;n++){s.step(.1);assert(main.v>24.9,'parallel traffic braked the motorway');safe(s);}
});
test('exit traffic slows in the separate deceleration lane without braking through traffic',()=>{
 const s=setup(),o=s.systems,r=o.ramps[1];while(s.id%7)s.id++;
 const c=s.spawn(0,r.offStart+1,28),behind=s.spawn(0,r.offStart-100,28);
 for(const car of [c,behind])Object.assign(car,{truck:false,length:4.7,desired:28,v:28,courtesy:1,cooldown:Infinity,decision:Infinity});
 const baseline=setup();baseline.systems.updateOffRamps=()=>{};while(baseline.id%7)baseline.id++;
 const through=baseline.spawn(0,r.offStart+1,28),control=baseline.spawn(0,r.offStart-100,28);
 for(const car of [through,control])Object.assign(car,{truck:false,length:4.7,desired:28,v:28,courtesy:1,cooldown:Infinity,decision:Infinity});
 let separate=false,last=28;
 for(let n=0;n<600&&s.cars.includes(c);n++){
  s.step(.1);baseline.step(.1);safe(s);
  if(c.offProgress<1)assert(c.v>27.9,'exit car braked before leaving the motorway');
  else{separate=true;assert(!s.occupiedLanes(c).includes(0));}
  assert(behind.v>=control.v-1e-7,'exit braking propagated into the running lane');last=c.v;
 }
 assert(separate);assert(!s.cars.includes(c));assert(last<26&&last>8,'deceleration lane did not reduce exit speed');assert.equal(o.totalExited,1);
});
test('open J2 keeps moving while G05 and G06 close the middle motorway lane',()=>{
 const s=new Simulation(seeded(17)),o=s.systems,r=o.ramps[1];s.nextIncident=s.nextEmergency=Infinity;
 o.work.announceAt=o.work.startsAt=o.roadblock.startsAt=o.phase.endsAt=Infinity;o.phase.multiplier=1.8;
 for(const ramp of o.ramps)ramp.nextArrival=Infinity;r.nextArrival=0;
 s.signals[4].forEach(signal=>signal.speed=50);s.signals[4][1].mode='merge-right';s.signals[5][1].mode='closed';
 const merged=new Set();
 for(let n=0;n<3000;n++){
  s.step(.1);
  for(const c of r.queue)assert(c.v>.1,'open-junction approach stopped at an artificial entry gate');
  for(const c of s.cars)if(c.onRamp===r.id){assert(c.v>.1,'open-junction acceleration lane stopped');if(c.rampMerging)merged.add(c.id);}
  if(n%20===0)safe(s);
 }
 assert(merged.size>=15,'junction failed to merge its demand');
});
test('an exit vehicle already clear of lane 1 passes a closed-lane queue and is counted once',()=>{
 for(const id of [1,2])for(const allClosed of [false,true]){
  const s=setup(),o=s.systems,r=o.ramps[id],x=r.offStart+r.offDeparture*.7;
  const c=s.spawn(0,x,0),block=s.spawn(0,x+10,0);
  Object.assign(c,{offRamp:id,offProgress:.7,truck:false,length:4.7,desired:25,v:0});
  Object.assign(block,{truck:false,length:4.7,v:0,recovering:999});
  for(const row of s.signals)for(const lane of allClosed?[0,1,2]:[0])row[lane].mode='closed';
  let before=c.x;
  for(let n=0;n<900&&s.cars.includes(c);n++){s.step(.1);assert(c.x>=before);assert(c.x-before<4);before=c.x;safe(s);}
  assert(!s.cars.includes(c),'exit car remained frozen beside the closed lane');assert(c.x>r.offStart+r.offLength);
  assert.equal(block.x,x+10,'fix moved the blocked motorway vehicle');assert.equal(o.totalExited,1);assert.equal(s.exits.length,1);
 }
});
test('an exiting vehicle still overlapping motorway traffic keeps collision separation',()=>{
 const s=setup(),r=s.systems.ramps[1],x=r.offStart+r.offDeparture*.4;
 const c=s.spawn(0,x,0),block=s.spawn(0,x+10,0);
 Object.assign(c,{offRamp:r.id,offProgress:.4,truck:false,length:4.7,v:0});
 Object.assign(block,{truck:false,length:4.7,v:0,recovering:999});
 for(let n=0;n<100;n++){s.step(.1);safe(s);assert(c.x<=block.x-block.length-1.99);}
 assert(s.occupiedLanes(c).includes(0),'exit vehicle released the running lane before body clearance');
});
test('J1 joining traffic can finish merging and pass a stopped lane-1 leader through the free adjacent lane',()=>{
 const s=setup(),r=s.systems.ramps[0],entry=r.x-r.mergeLength,c=arrival(s,r,0,20);
 const front=s.spawn(0,entry+150,20);Object.assign(front,{truck:false,length:4.7,desired:20,v:20,courtesy:1,cooldown:Infinity,decision:Infinity});
 for(let n=0;n<40;n++)s.step(.1);
 assert(c.rampMerging,'test did not establish a junction merge');
 front.recovering=999;front.v=0;const blockedAt=front.x;let passed=false;
 for(let n=0;n<400;n++){
  const before=new Map(s.cars.map(c=>[c.id,c.x]));s.step(.1);safe(s,before);
  if(c.x>blockedAt+20){passed=true;break;}
 }
 assert(passed,'joined vehicle remained trapped in junction mode');assert.equal(c.onRamp,null);assert.equal(c.slipRamp,null);assert.equal(front.x,blockedAt);
});
test('a stopped committed merger releases the acceleration lane after its body steers clear',()=>{
 for(const truck of [false,true]){
  const s=setup(),r=s.systems.ramps[0],c=s.spawn(0,900,0),front=s.spawn(0,910,0);
  Object.assign(c,{truck,length:truck?16.5:4.7,onRamp:r.id,slipRamp:r.id,rampMerging:true,rampMergeStart:600,rampSteerProgress:0,rampSteerDuration:truck?5.5:4.5,cooldown:Infinity});
  Object.assign(front,{truck:false,length:4.7,recovering:999,v:0});for(const row of s.signals){row[1].mode=row[2].mode='closed';}
  for(let n=0;n<60;n++){s.step(.1);safe(s);}
  assert(c.x<r.x,'test vehicle did not remain upstream of the old handoff point');assert.equal(c.onRamp,null);assert.equal(c.rampSteerProgress,1);
  const follower=s.spawn(0,860,0);Object.assign(follower,{onRamp:r.id,rampMerging:false});assert.equal(s.obstacle(follower,10+r.id).gap,Infinity,'completed merger still reserves the acceleration lane');
 }
});
test('a stopped joiner at every junction receives a lasting gap request until it merges',()=>{
 for(const id of [0,1,2])for(const truck of [false,true]){
  const s=setup(19),o=s.systems,r=o.ramps[id],point=r.x-r.joinTaper,c=s.spawn(0,point-3.5,0);
  Object.assign(c,{truck,length:truck?16.5:4.7,desired:25,v:0,headway:2,courtesy:1,onRamp:id,slipRamp:id,rampMerging:false,cooldown:0,decision:0});
  const main=x=>{const car=s.spawn(0,x,23);Object.assign(car,{truck:false,length:4.7,desired:25,v:23,courtesy:1,headway:1.2,acceleration:1.3,cooldown:Infinity,decision:Infinity});};
  for(let n=-8;n<=8;n++)main(point+n*50+10);
  let finished=null;
  for(let n=0;n<600;n++){
   if(n%20===0&&s.cars.every(a=>a===c||a.lane!==0||Math.abs(a.x-(point-450))>35))main(point-450);
   const before=new Map(s.cars.map(c=>[c.id,c.x]));s.step(.1);safe(s,before);
   if(c.onRamp==null){finished=(n+1)/10;break;}
  }
  assert(finished!=null&&finished<(truck?35:25),r.name+' remained stuck despite continuous safe gap assistance');assert(c.x>point);assert.equal(c.slipRamp,null);
 }
});
