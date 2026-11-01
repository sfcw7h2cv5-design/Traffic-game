import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, LENGTH, GANTRIES } from './model.js';
function seeded(seed = 42) { let n = seed; return () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296); }
function quiet(s) { s.nextIncident = Infinity; s.nextEmergency = Infinity; s.nextArrival = Infinity; s.waiting = 0; }
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
 const s = new Simulation(() => .4); s.nextIncident = 0; s.step(.1);
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

test('all five gantries control their own downstream sections, including the last two', () => {
 const s = new Simulation(seeded());quiet(s);s.cars=[];
 assert.equal(GANTRIES.length,5);assert.equal(LENGTH,6000);
 for(let g=0;g<GANTRIES.length;g++) {
  s.signals[g][0].speed=20+g*10;
  assert.equal(s.signalAt(GANTRIES[g]+1,0).speed,20+g*10);
 }
 s.signals[4][1].mode='closed';const c=s.spawn(1,GANTRIES[4]-100,15);
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
 assert.equal(i.status,'recovering');assert(i.clearsAt>s.elapsed+130);
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
  const s=new Simulation(seeded(seed));s.scenario='busy';s.nextEmergency=0;
  s.addIncident(0,2400,'breakdown');
  for(let n=0;n<3000;n++){
   if(n===900)s.signals[2][1].mode='closed';
   s.step(.1);
   const bodies=[...s.cars,...s.incidents.map(i=>({...i,visualLane:i.lane,fromLane:i.lane}))];
   for(let a=0;a<bodies.length;a++)for(let b=a+1;b<bodies.length;b++){
    const x=bodies[a],y=bodies[b];
    if(!s.occupiedLanes(x).some(l=>s.occupiedLanes(y).includes(l)))continue;
    const front=x.x>=y.x?x:y,back=front===x?y:x;
    assert(front.x-front.length-back.x>=1.99,`overlap seed ${seed} time ${s.elapsed}: ${front.id}/${back.id}`);
   }
  }
 }
});
