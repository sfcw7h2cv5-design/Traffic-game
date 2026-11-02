import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from './model.js';
function seeded(seed=202){let n=seed;return()=>((n=(n*1664525+1013904223)>>>0)/4294967296);}
function quiet(s){s.systemsEnabled=false;s.nextArrival=s.nextIncident=s.nextEmergency=Infinity;s.waiting=0;}
function separated(s){
 const bodies=[...s.cars,...s.incidentBodies()];
 for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
  const a=bodies[i],b=bodies[j];if(!s.occupiedLanes(a).some(l=>s.occupiedLanes(b).includes(l)))continue;
  const front=a.x>=b.x?a:b,back=front===a?b:a;assert(front.x-front.length-back.x>=1.99,'overlap');
 }
}
function trafficUsage(limit,scenario='commute'){
 const s=new Simulation(seeded());s.systemsEnabled=false;s.nextEmergency=s.nextIncident=Infinity;s.scenario=scenario;
 s.signals.forEach(row=>row.forEach(signal=>signal.speed=limit));
 const totals=[0,0,0];let samples=0,overtakes=0;
 for(let tick=0;tick<3000;tick++){
  const before=new Map(s.cars.map(c=>[c.id,{lane:c.lane,x:c.x,turning:!!c.laneChange}]));
  s.step(.1);
  for(const c of s.cars){
   const old=before.get(c.id);
   if(old){assert(c.x>=old.x-1e-7);if(old.lane!==c.lane){assert.equal(Math.abs(old.lane-c.lane),1);assert(!old.turning);if(old.lane===1&&c.lane===2&&!c.truck)overtakes++;}}
   assert(!c.truck||c.lane<2,'HGV used lane 3 on an open motorway');
  }
  if(tick%100===0)separated(s);
  if(tick>=2400&&tick%10===0){for(const c of s.cars)if(c.lane>=0)totals[c.lane]++;samples++;}
 }
 return {average:totals.map(n=>n/samples),overtakes};
}
test('ordinary traffic uses lane 3 at 30 and 40 mph without losing its keep-left preference',()=>{
 for(const limit of [30,40]){
  const {average,overtakes}=trafficUsage(limit);
  assert(average[0]>average[1]&&average[1]>average[2],limit+' mph did not retain left bias: '+average);
  assert(average[2]>12,limit+' mph left the third lane effectively empty');
  assert(overtakes>=20,limit+' mph had too few genuine right-hand overtakes');
 }
});
test('heavier demand shares a reduced-limit motorway across all three lanes',()=>{
 const {average,overtakes}=trafficUsage(40,'busy');
 assert(average.every(n=>n>35),'an open lane remained underused in heavy traffic: '+average);
 assert(overtakes>30);
});
test('a car moving aside for a junction does not immediately return into the merging gap',()=>{
 const s=new Simulation(seeded(22));quiet(s);s.cars=[];
 const c=s.spawn(0,5200,20);Object.assign(c,{truck:false,length:4.7,desired:25,cooldown:0,decision:0,rampYieldEntry:5500,rampYieldUntil:1,rampYieldTargetSpeed:18});
 s.step(.1);assert.equal(c.lane,1);assert.equal(c.rampClearUntilX,5580);
 for(let n=0;n<400&&c.x<5580;n++){s.step(.1);assert.equal(c.lane,1);separated(s);}
 assert(c.x>=5580);for(let n=0;n<250&&c.lane!==0;n++)s.step(.1);assert.equal(c.lane,0);
});
test('a courtesy request applies only before entry, only in lane 1, and only until expiry',()=>{
 function make(lane,x,until){
  const s=new Simulation(seeded(22));quiet(s);s.cars=[];
  const c=s.spawn(lane,x,20);Object.assign(c,{truck:false,desired:25,courtesy:1,cooldown:Infinity,decision:Infinity,rampYieldEntry:5500,rampYieldUntil:until,rampYieldTargetSpeed:17});
  return {s,c};
 }
 const active=make(0,5400,10),other=make(1,5400,10),passed=make(0,5550,10),expired=make(0,5400,0);
 for(let n=0;n<10;n++)for(const value of [active,other,passed,expired])value.s.step(.1);
 assert(active.c.v<20);assert(other.c.v>20&&passed.c.v>20&&expired.c.v>20);
});
