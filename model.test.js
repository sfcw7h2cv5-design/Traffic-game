import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, LENGTH, GANTRIES } from './model.js';
function seeded(seed = 42) { let n = seed; return () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296); }
function quiet(s) { s.systemsEnabled=false; s.nextIncident = Infinity; s.nextEmergency = Infinity; s.nextArrival = Infinity; s.waiting = 0; }
function run(s, seconds) { for (let i = 0; i < seconds * 10; i++) s.step(.1); }
test('free traffic keeps left, with identifiable HGVs and sparse overtaking lanes', () => {
 const s = new Simulation(seeded()); quiet(s);
 assert(s.cars.filter(c => c.lane === 0).length > s.cars.length / 2);
 assert(s.cars.some(c => c.truck && c.length > 15));
 run(s, 90);
 assert(s.exits.length > 0);
 assert(s.cars.every(c => Number.isFinite(c.x) && c.v >= 0 && c.v < 40));
 assert(s.cars.every(c => !c.truck || c.lane < 2));
});
test('a driver returns left on a clear road, and overtakes a slower HGV on the right', () => {
 const s = new Simulation(seeded()); quiet(s); s.cars = [];
 const car = s.spawn(2, 500, 28);car.truck = false;car.cooldown = 0;car.decision = 0;
 run(s, 25);assert.equal(car.lane, 0);
 s.cars = [];
 const slow = s.spawn(0, 1100, 18);slow.truck = true;slow.desired = 18;slow.length = 16.5;
 const fast = s.spawn(0, 1010, 26);fast.truck = false;fast.desired = 32;fast.cooldown = 0;fast.decision = 0;
 run(s, 2);assert.equal(fast.lane, 1);
});
test('automatic breakdowns always occupy the left lane and retain a stopped vehicle', () => {
 const s = new Simulation(() => .2); s.nextIncident = 0; s.step(.1);
 assert.equal(s.incidents.length, 1); assert.equal(s.incidents[0].lane, 0);
 assert.equal(s.incidents[0].type, 'breakdown');assert(s.incidents[0].length > 0);assert(s.lastEvent.includes('Lane 1'));
 assert.equal(s.addIncident(2, 1800).lane, 0);
});
test('queue releases front to back instead of every vehicle moving together', () => {
 const s = new Simulation(seeded()); quiet(s); s.cars = [];
 for (const g of s.signals) { g[1].mode = 'closed'; g[2].mode = 'closed'; }
 const cars = [970, 958, 946, 934].map(x => s.spawn(0, x, 0));
 for (const c of cars) { c.cooldown = 100; c.reaction = 1; c.truck = false; c.length = 4.7; c.acceleration = 1.3; }
 s.incidents = [{ lane: 0, x: 980, length: 5, type: 'breakdown' }];
 run(s, 15);assert(cars.every(c => c.v < .4));
 s.incidents = [];run(s, 2);
 assert(cars[0].v > cars[3].v + .3);
 run(s, 15);assert(cars[3].v > 1);
});
test('a closure forms a growing queue without vehicles crossing the closed gantry', () => {
 const s = new Simulation(seeded());quiet(s);s.cars = [];
 for (const g of s.signals) for (const lane of g) lane.mode = 'closed';
 const cars = [350, 250, 150].map(x => s.spawn(0, x, 20));
 run(s, 40);assert(cars.every(c => c.x < 450 && c.v < .5));
 for (let i = 0; i < cars.length - 1; i++) assert(cars[i].x - cars[i].length > cars[i + 1].x);
});

test('all gantries control their own downstream sections, including the last two', () => {
 const s = new Simulation(seeded());quiet(s);s.cars=[];
 assert.equal(GANTRIES.length,7);assert.equal(LENGTH,10000);
 for(let g=0;g<GANTRIES.length;g++) {
  s.signals[g][0].speed=20+g*10;
  assert.equal(s.signalAt(GANTRIES[g]+1,0).speed,20+g*10);
 }
 const last=GANTRIES.length-1;s.signals[last][1].mode='closed';const c=s.spawn(1,GANTRIES[last]-100,15);
 assert(s.obstacle(c,1).gap<100);
});
test('lowering a posted limit measurably slows vehicles in that lane and section', () => {
 const s = new Simulation(seeded());quiet(s);s.cars=[];
 const slow=s.spawn(0,3900,30),fast=s.spawn(1,3900,30);
 for(const c of [slow,fast]){c.truck=false;c.desired=32;c.courtesy=1;c.cooldown=1000;}
 s.signals[3][0].speed=30;run(s,20);
 assert(slow.v/.44704<32);assert(fast.v-slow.v>10);
 assert.equal(s.signalAt(4900,0).speed,70);
});
test('drivers anticipate a lower limit before the gantry rather than braking only after it', () => {
 const s=new Simulation(seeded());quiet(s);s.cars=[];s.signals[4][0].speed=20;
 const c=s.spawn(0,GANTRIES[4]-120,30);c.truck=false;c.desired=32;c.cooldown=1000;
 run(s,2);assert(c.x<GANTRIES[4]);assert(c.v<29);
});
test('breakdowns wait for a real recovery truck, then load and tow away', () => {
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 s.signals[1][0].mode='closed';const i=s.addIncident(0,2200,'breakdown');
 assert.equal(i.clearsAt,Infinity);assert.equal(i.status,'awaiting-recovery');
 assert(s.dispatchRecovery(i));assert(!s.dispatchRecovery(i));
 const tow=s.cars.find(c=>c.kind==='recovery');assert(tow&&tow.lane===-1);
 run(s,2);assert(s.incidents.includes(i));assert.equal(i.status,'recovery-en-route');
 for(let n=0;n<1000&&i.status!=='recovering';n++)s.step(.1);
 assert.equal(i.status,'recovering');assert(i.clearsAt>=s.elapsed+18&&i.clearsAt<=s.elapsed+30);
 for(let n=0;n<3000&&s.incidents.length;n++)s.step(.1);
 assert.equal(s.incidents.length,0);assert(tow.towing);assert.equal(tow.recoveryTarget,null);
 assert.equal(s.signals[1][0].mode,'closed');
});
test('debris lasts several simulated minutes before crews clear it',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const i=s.addIncident(1,2500,'debris');assert(i.clearsAt>=240);
 run(s,150);assert(s.incidents.includes(i));
 run(s,220);assert(!s.incidents.includes(i));
});
test('emergency vehicles have priority speed but cannot pass through traffic',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const police=s.spawn(2,1000,30,'police');const ordinary=s.spawn(0,1000,30);ordinary.truck=false;ordinary.desired=32;ordinary.cooldown=1000;
 run(s,15);assert(police.v>ordinary.v+3);assert(police.emergency);
 s.cars=[];const front=s.spawn(2,1500,0),ambulance=s.spawn(2,1470,30,'ambulance');
 front.cooldown=ambulance.cooldown=1000;front.desired=0.1;
 run(s,4);assert(ambulance.x<=front.x-front.length-1.99);
});
test('traffic yields left for an approaching emergency vehicle when there is a gap',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const car=s.spawn(2,1200,25);car.cooldown=0;car.decision=0;
 s.spawn(2,1050,35,'ambulance');run(s,.2);assert.equal(car.lane,1);
});
test('dense traffic never overlaps, including lane-change reservations and incidents',()=>{
 for(const seed of [42,77,192]){
  const s=new Simulation(seeded(seed));s.scenario='busy';s.nextEmergency=0;s.systemsEnabled=false;
  s.addIncident(0,2400,'breakdown');
  for(let n=0;n<3000;n++){
   if(n===900)s.signals[2][1].mode='closed';
   const before=new Map(s.cars.map(c=>[c.id,c.x]));
   s.step(.1);
   for(const c of s.cars)if(before.has(c.id))assert(c.x>=before.get(c.id)-1e-7,`vehicle moved backwards: ${c.id} at ${s.elapsed}`);
   const bodies=[...s.cars,...s.incidentBodies()];
   for(let a=0;a<bodies.length;a++)for(let b=a+1;b<bodies.length;b++){
    const x=bodies[a],y=bodies[b];
    if(!s.occupiedLanes(x).some(l=>s.occupiedLanes(y).includes(l)))continue;
    const front=x.x>=y.x?x:y,back=front===x?y:x;
    assert(front.x-front.length-back.x>=1.99,`overlap seed ${seed} time ${s.elapsed}: ${front.id}/${back.id}`);
   }
  }
 }
});

test('automatic recovery dispatches promptly and completes short loading without operator input',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const i=s.addIncident(0,2200,'breakdown');
 run(s,11);assert.equal(i.status,'recovery-en-route');assert(s.cars.some(c=>c.kind==='recovery'));
 for(let n=0;n<1000&&i.status!=='recovering';n++)s.step(.1);
 assert.equal(i.status,'recovering');const loadingStarts=s.elapsed;
 for(let n=0;n<310&&s.incidents.length;n++)s.step(.1);
 assert.equal(s.incidents.length,0);assert(s.elapsed-loadingStarts<31);
});
test('police and ambulance both exceed 70 mph on clear roads, including under lower signs',()=>{
 for(const kind of ['police','ambulance']){
  const s=new Simulation(seeded());quiet(s);s.cars=[];
  for(const row of s.signals)for(const signal of row)signal.speed=40;
  const vehicle=s.spawn(2,500,30,kind);run(s,25);
  assert(vehicle.v/.44704>80,`${kind}: ${vehicle.v/.44704} mph`);
 }
});

test('merge arrows direct vehicles right and left, visibly and physically',()=>{
 for(const [lane,target] of [[0,1],[2,1]]){
  const s=new Simulation(seeded());quiet(s);s.cars=[];
  const c=s.spawn(lane,2000,20);c.truck=false;c.cooldown=0;c.decision=0;
  s.signals[1][lane].mode='merge';run(s,5);
  assert.equal(c.lane,target);assert(Math.abs(c.visualLane-target)<.02);
 }
});
test('vehicles merge out of a closed lane and do not re-enter it upstream',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const c=s.spawn(0,1300,20);c.cooldown=0;c.decision=0;
 s.signals[1][0].mode='closed';run(s,25);
 assert(c.x>1550);assert.notEqual(c.lane,0);
});
test('HGV can follow closure instructions into the only available lane',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const c=s.spawn(1,2000,15);c.truck=true;c.cooldown=0;c.decision=0;
 s.signals[1][0].mode='closed';s.signals[1][1].mode='closed';run(s,6);
 assert.equal(c.lane,2);assert(c.visualLane>1.98);
});
test('adjacent traffic yields to let a stopped vehicle merge out of a closure',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const c=s.spawn(0,1500,0);c.truck=false;c.cooldown=0;c.decision=0;
 for(const x of [1450,1320,1190]){const neighbour=s.spawn(1,x,20);neighbour.truck=false;neighbour.cooldown=1000;}
 s.signals[1][0].mode='closed';run(s,35);assert.equal(c.lane,1);assert(c.x>1550);
});

test('keep-left drivers do not return into a lane that is closing ahead',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const c=s.spawn(1,1400,5);c.truck=false;c.cooldown=0;c.decision=0;
 s.signals[1][0].mode='closed';run(s,2);assert.equal(c.lane,1);
});

test('random incidents rotate across the network and keep clear of gantries',()=>{
 for(const seed of [42,77,192]){
  const s=new Simulation(seeded(seed));quiet(s);s.cars=[];s.incidents=[];
  const zones=new Set();
  for(let n=0;n<5;n++){
   const position=s.nextIncidentPosition();assert(position!=null);
   const incident=s.addIncident(0,position,'breakdown');assert(incident);
   assert(GANTRIES.every(g=>Math.abs(incident.x-g)>=350));
   zones.add(GANTRIES.findLastIndex(g=>incident.x>g));s.incidents=[];
  }
  assert.equal(zones.size,5);
 }
});
test('active incidents stay separated across lanes and target locations',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];s.incidents=[];
 for(const position of [1550,1600,1650])s.addIncident(1,position,'collision');
 assert(s.incidents.length>=2);
 for(const i of s.incidents){assert(GANTRIES.every(g=>Math.abs(i.x-g)>=350));for(const j of s.incidents)if(i!==j)assert(Math.abs(i.x-j.x)>=600);}
});

test('entry waits while a merging vehicle still occupies the source lane',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const c=s.spawn(2,10,10);c.fromLane=1;c.visualLane=1.2;c.cooldown=100;
 s.waiting=5;s.signals.forEach(g=>g[0].mode='closed');
 s.step(.1);assert.equal(s.cars.filter(o=>o.id!==c.id&&o.lane===1).length,0);assert(c.x>=10);
});
test('automatic breakdowns convert real settled vehicles rather than materialising mid-road',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 assert.equal(s.addIncident(0,2200,'breakdown',{requireVehicle:true}),null);
 const c=s.spawn(0,2200,20);const incident=s.addIncident(0,2200,'breakdown',{requireVehicle:true});
 assert(incident);assert.equal(incident.vehicleId,c.id);assert.equal(incident.x,c.x);assert(!s.cars.includes(c));
 s.dispatchRecovery(incident);const tow=s.cars.find(c=>c.kind==='recovery');assert(tow.x<=0);
});

test('shed loads block both affected lanes while leaving the third lane usable',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const incident=s.addMultiLaneIncident('shed-load',2200,[0,1]);assert(incident);
 assert.equal(s.incidents.length,1);assert.deepEqual(incident.lanes,[0,1]);
 const car={id:-1,x:2100,desired:30,length:4.7};
 assert.equal(s.obstacle(car,0).speed,0);assert.equal(s.obstacle(car,1).speed,0);assert(s.obstacle(car,2).gap>500);
 assert.equal(s.incidentBodies().length,2);assert(s.lastEvent.includes('Lanes 1 & 2'));
 run(s,430);assert.equal(s.incidents.length,0);
});
test('pile-ups convert real vehicles in both lanes without phantom cars',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const a=s.spawn(1,2200,20),b=s.spawn(2,2220,22);a.truck=b.truck=false;
 const incident=s.addMultiLaneIncident('pile-up',2200,[1,2]);assert(incident);assert.equal(s.cars.length,0);
 assert.deepEqual(incident.bodies.map(x=>x.vehicleId),[a.id,b.id]);
 assert.deepEqual(s.incidentBodies().map(i=>i.lane),[1,2]);
});
test('shed loads do not appear on top of existing or merging vehicles',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 for(let x=2050;x<=2350;x+=10)s.spawn(0,x,0);
 assert.equal(s.addMultiLaneIncident('shed-load',2200,[0,1]),null);
});
test('explicit middle-lane arrows work in either direction',()=>{
 for(const [mode,target] of [['merge-left',0],['merge-right',2]]){
  const s=new Simulation(seeded());quiet(s);s.cars=[];
  const c=s.spawn(1,2200,20);c.truck=false;c.cooldown=0;c.decision=0;s.signals[1][1].mode=mode;run(s,5);
  assert.equal(c.lane,target);
 }
});
test('emergency vehicles can pass a slower right-lane vehicle on a clear adjacent lane',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const front=s.spawn(2,1300,28);front.truck=false;front.desired=28;front.cooldown=1000;
 const police=s.spawn(2,1100,38,'police');run(s,25);
 assert(police.x>front.x+25);assert(police.v/.44704>95);
});
test('clear-road police and ambulance reach the higher response speeds quickly',()=>{
 for(const [kind,minimum] of [['police',100],['ambulance',90]]){
  const s=new Simulation(seeded());quiet(s);s.cars=[];
  const c=s.spawn(2,1000,30,kind);run(s,20);assert(c.v/.44704>minimum);
 }
});

test('cars already stopped before two closed lanes can reach the third open lane',()=>{
 for(const [lane,closed,target] of [[0,[0,1],2],[2,[1,2],0]]){
  const s=new Simulation(seeded());quiet(s);s.cars=[];
  const c=s.spawn(lane,1538,0);c.truck=false;c.cooldown=0;c.decision=0;
  for(const l of closed)s.signals[1][l].mode='closed';
  let last=c.x;
  for(let n=0;n<500;n++){s.step(.1);assert(c.x>=last-1e-7);last=c.x;}
  assert.equal(c.lane,target);assert(c.x>1700);
 }
});
test('vehicles within a two-lane closure move across it to the open lane',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const c=s.spawn(0,1900,5);c.truck=true;c.cooldown=0;c.decision=0;
 s.signals[1][0].mode=s.signals[1][1].mode='closed';run(s,25);
 assert.equal(c.lane,2);assert(c.x>1950);
});
test('a stopped driver can use a close safe gap beside a single closure',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const c=s.spawn(0,1538,0);c.truck=false;c.cooldown=0;c.decision=0;
 s.signals[1][0].mode='closed';run(s,25);assert.equal(c.lane,1);assert(c.x>1550);
});
test('drivers still wait when every lane is closed',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const c=s.spawn(0,1538,0);for(const lane of s.signals[1])lane.mode='closed';
 run(s,20);assert.equal(c.lane,0);assert(c.x<1550);
});

test('traffic can navigate successive closures whose open lane changes',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const c=s.spawn(0,2100,10);c.truck=false;c.cooldown=0;c.decision=0;
 s.signals[1][0].mode=s.signals[1][1].mode='closed';
 s.signals[2][0].mode=s.signals[2][2].mode='closed';
 for(let n=0;n<1000&&c.x<2800;n++)s.step(.1);assert(c.x>=2800);assert.equal(c.lane,1);
});

test('a driver merges around an incident once and stays out until it is passed',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 s.addIncident(0,2200,'breakdown');s.incidents[0].dispatchAt=Infinity;
 const c=s.spawn(0,1500,25);c.truck=false;c.length=4.7;c.desired=30;c.cooldown=0;c.decision=0;
 const changes=[];let old=c.lane;
 for(let i=0;i<600;i++){s.step(.1);if(c.lane!==old){changes.push({from:old,to:c.lane,x:c.x});old=c.lane;}}
 assert(changes.some(t=>t.from===0&&t.to===1));
 assert(changes.filter(t=>t.to===0).every(t=>t.x>2220));assert(changes.length<=2);
});
test('an incident in another lane does not slow free traffic',()=>{
 const speeds=[];
 for(const incident of [false,true]){
  const s=new Simulation(seeded());quiet(s);s.cars=[];
  if(incident){s.addIncident(0,2200,'breakdown');s.incidents[0].dispatchAt=Infinity;}
  const c=s.spawn(1,1900,28);c.truck=false;c.desired=31;c.cooldown=1000;
  run(s,20);speeds.push(c.v);
 }
 assert(Math.abs(speeds[0]-speeds[1])<.5);
});
test('a staged closure evacuation keeps its chosen destination instead of reversing',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 s.signals[1][1].mode='closed';s.signals[1][2].mode='closed';
 const c=s.spawn(2,1538,0);c.truck=false;c.cooldown=0;c.decision=0;
 const lanes=[c.lane];let old=c.lane;
 for(let i=0;i<350;i++){s.step(.1);if(c.lane!==old){lanes.push(c.lane);old=c.lane;}}
 assert.deepEqual(lanes,[2,1,0]);
});

test('closing all lanes cancels a previously chosen escape destination',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 const c=s.spawn(0,1538,0);c.cooldown=0;c.decision=0;c.evacuationGoal=2;
 for(const signal of s.signals[1])signal.mode='closed';run(s,10);
 assert.equal(c.evacuationGoal,null);assert.equal(c.lane,0);assert(c.x<1550);
});

test('queue guidance identifies the tail and a gantry upstream of it',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 for(const x of [3200,3220,3240])s.spawn(0,x,0);
 const advice=s.trafficAdvice();assert.equal(advice.kind,'queue');assert.equal(advice.tail,3200);
 assert.equal(advice.gantry,2);assert.equal(advice.targetSpeed,40);assert.equal(advice.stopped,3);
});
test('clear-road advice does not recommend slowing traffic without a queue or incident',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];s.spawn(0,2000,28);
 const advice=s.trafficAdvice();assert.equal(advice.kind,'clear');assert.equal(advice.gantry,-1);
});
test('a measured upstream speed restriction reduces peak braking on a queue approach',()=>{
 const peaks=[];
 for(const controlled of [false,true]){
  const s=new Simulation(()=>.5);quiet(s);s.cars=[];
  for(const g of s.signals)g[1].mode=g[2].mode='closed';
  const c=s.spawn(0,1900,30);Object.assign(c,{truck:false,length:4.7,desired:31,acceleration:1.3,courtesy:1,reaction:1});
  s.incidents=[{id:0,lane:0,x:3300,length:4.7,type:'debris',clearsAt:Infinity}];
  if(controlled)s.signals[2][0].speed=40;
  let peak=0;for(let i=0;i<1500;i++){s.step(.1);peak=Math.max(peak,-c.a);}peaks.push(peak);
  assert(c.x<3300);assert(c.v<.5);
 }
 assert(peaks[1]<peaks[0]*.9,JSON.stringify(peaks));
});
test('hard braking counts episodes and expires them after one simulated minute',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 for(const g of s.signals)g[1].mode=g[2].mode='closed';
 s.spawn(0,2135,30);s.incidents=[{id:0,lane:0,x:2200,length:5,type:'debris',clearsAt:Infinity}];
 run(s,2);assert(s.trafficAdvice().hardBrakes>0);assert(s.trafficAdvice().hardBrakes<=2);
 run(s,90);assert.equal(s.trafficAdvice().hardBrakes,0);
});

test('traffic already alongside a waiting merger does not brake to let it in',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 s.signals[1][0].mode='closed';
 const waiting=s.spawn(0,2200,0);waiting.length=16.5;waiting.truck=true;waiting.cooldown=0;waiting.decision=0;
 const passing=s.spawn(1,2192,28);passing.truck=false;passing.cooldown=1000;
 const behind=s.spawn(1,2100,28);behind.truck=false;behind.cooldown=1000;
 s.step(.1);assert.equal(passing.yieldingFor,null);assert.equal(behind.yieldingFor,null);assert(passing.v>27.9);
});
test('only the nearest rear driver is asked to make a merging gap',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 s.signals[1][0].mode='closed';
 const waiting=s.spawn(0,2200,0);waiting.length=4.7;waiting.cooldown=0;waiting.decision=0;
 const nearest=s.spawn(1,2165,24);nearest.cooldown=1000;
 const second=s.spawn(1,2100,24);second.cooldown=1000;
 s.step(.1);assert.equal(nearest.yieldingFor,waiting.id);assert.equal(second.yieldingFor,null);
});
test('an incident in the original lane stops influencing a vehicle once its body has cleared that lane',()=>{
 const s=new Simulation(seeded());quiet(s);s.cars=[];
 s.incidents=[{id:0,lane:0,x:2200,length:5,type:'debris',clearsAt:Infinity}];
 const c=s.spawn(1,2170,10);c.truck=false;c.length=4.7;c.fromLane=0;c.visualLane=.85;c.cooldown=1000;c.a=0;
 const before=c.v;s.step(.1);assert(c.v>=before);assert(!s.occupiedLanes(c).includes(0));
});
