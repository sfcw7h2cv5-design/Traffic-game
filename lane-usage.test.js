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
test('G02 arrow and G03 lane-1 closure share traffic across the two open lanes',()=>{
 const s=new Simulation(seeded(71));s.systemsEnabled=false;s.nextIncident=s.nextEmergency=Infinity;
 s.signals[1][0].mode='merge-right';s.signals[2][0].mode='closed';s.incidents=[{id:0,lane:0,x:3300,length:5,type:'debris',clearsAt:Infinity}];
 let stopped=0,outside=0,crossed=0;
 for(let n=0;n<6000;n++){
  const before=new Map(s.cars.map(c=>[c.id,c.x]));s.step(.1);
  if(n>1200)for(const c of s.cars){
   if(c.x>2000&&c.x<3300){if(c.lane===1&&c.v<1)stopped++;if(c.lane===2)outside++;}
   if(before.get(c.id)<3000&&c.x>=3000)crossed++;
  }
  if(n%100===0)separated(s);
 }
 assert(stopped<200,'closure produced sustained gridlock in the open middle lane');assert(outside>15000,'outside lane was not used');assert(crossed>130,'closure flow stalled');
});

test('a faster car returning ahead does not provoke the overtaken driver to move right',()=>{
 for(const lane of [0,1])for(const merging of [false,true])for(const desired of [22,30]){
  const s=new Simulation(seeded());quiet(s);s.cars=[];
  const c=s.spawn(lane,2200,22),passing=s.spawn(lane,2255,28);
  Object.assign(c,{truck:false,length:4.7,desired,courtesy:1,reaction:1,headway:2,cooldown:0,decision:0});
  Object.assign(passing,{truck:false,length:4.7,desired:30,courtesy:1,cooldown:Infinity,decision:Infinity});
  if(merging){passing.visualLane=lane+1;passing.fromLane=lane+1;passing.laneChange={from:lane+1,to:lane,progress:0,duration:4.5};}
  for(let n=0;n<150;n++){s.step(.1);assert(c.lane<=lane,'overtaken car moved right behind a faster vehicle');separated(s);}
 }
});
