import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,GANTRIES} from './model.js';
function seeded(seed=67){let n=seed;return()=>((n=(n*1664525+1013904223)>>>0)/4294967296);}
function setup(){
 const s=new Simulation(seeded());s.systemsEnabled=false;s.cars=[];s.incidents=[];
 s.nextArrival=s.nextIncident=s.nextEmergency=Infinity;s.waiting=0;return s;
}
function driver(s,lane,x=2100,v=25){
 const c=s.spawn(lane,x,v);Object.assign(c,{truck:false,length:4.7,desired:28,courtesy:1,acceleration:1.3,reaction:1,headway:2,cooldown:0,decision:0});return c;
}
function stepSafe(s){
 const before=new Map(s.cars.map(c=>[c.id,c.x]));s.step(.1);
 for(const c of s.cars)if(before.has(c.id))assert(c.x>=before.get(c.id)-1e-7,'driver moved backwards');
 const bodies=[...s.cars,...s.incidentBodies()];
 for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
  const a=bodies[i],b=bodies[j];if(!s.occupiedLanes(a).some(l=>s.occupiedLanes(b).includes(l)))continue;
  const front=a.x>=b.x?a:b,back=front===a?b:a;assert(front.x-front.length-back.x>=1.99,'physical overlap');
 }
}
test('the only open lane continues freely until an upcoming advisory section begins',()=>{
 for(const [lane,mode,target] of [[0,'merge-right',1],[1,'merge-left',0],[1,'merge-right',2],[2,'merge-left',1]]){
  const s=setup(),c=driver(s,lane);
  for(let l=0;l<3;l++)s.signals[1][l].mode=l===lane?'open':'closed';
  s.signals[2][lane].mode=mode;
  while(c.x<GANTRIES[2]){
   const x=c.x;stepSafe(s);assert.equal(c.lane,lane,'a future arrow sent traffic into the current closure');assert(c.v>=25,'a future arrow slowed the only open lane');assert(c.x>x);
  }
  for(let n=0;n<20&&c.lane===lane;n++)stepSafe(s);
  assert.equal(c.lane,target,'driver did not follow the arrow once its section began');
 }
});
test('an advisory arrow towards a closed lane lets traffic continue without oscillation',()=>{
 for(const [lane,mode] of [[0,'merge-right'],[1,'merge-left'],[1,'merge-right'],[2,'merge-left']]){
  const s=setup(),c=driver(s,lane,1900,25);
  for(let l=0;l<3;l++)s.signals[1][l].mode=l===lane?mode:'closed';
  for(let n=0;n<150;n++){stepSafe(s);assert.equal(c.lane,lane);assert.equal(c.evacuationGoal,null);assert(c.v>=25);}
 }
});
test('arrows which point at each other do not create repeated lane changes',()=>{
 const s=setup(),a=driver(s,0,1900,25),b=driver(s,1,1900,25);
 s.signals[1][0].mode='merge-right';s.signals[1][1].mode='merge-left';
 for(let n=0;n<180;n++){stepSafe(s);assert.equal(a.lane,0);assert.equal(b.lane,1);assert(a.v>=25&&b.v>=25);}
});
test('a driver in an advisory lane waits alongside traffic and merges at its first safe gap',()=>{
 for(const [lane,mode,target] of [[0,'merge-right',1],[2,'merge-left',1]]){
  const s=setup(),c=driver(s,lane,1900,25),alongside=driver(s,target,1900,25);
  alongside.cooldown=alongside.decision=Infinity;s.signals[1][lane].mode=mode;
  for(let n=0;n<80;n++){stepSafe(s);assert.equal(c.lane,lane,'driver entered occupied adjacent space');assert(c.v>=25,'advisory arrow created a stop line');}
  alongside.desired=35;c.desired=25;
  let moved=false;
  for(let n=0;n<200;n++){stepSafe(s);if(c.lane===target){moved=true;break;}}
  assert(moved,'driver failed to use the newly available gap');
 }
});
test('two actual closed lanes keep a single staged escape instead of reversing',()=>{
 for(const [lane,closed,target] of [[0,[0,1],2],[2,[1,2],0]]){
  const s=setup(),c=driver(s,lane,1900,5),changes=[lane];let previous=lane;
  for(const l of closed)s.signals[1][l].mode='closed';
  for(let n=0;n<400;n++){
   stepSafe(s);if(c.lane!==previous){changes.push(c.lane);previous=c.lane;}
   if(c.lane===target&&!c.laneChange)break;
  }
  assert.deepEqual(changes,[lane,1,target]);assert.equal(c.lane,target);
 }
});
test('red-X boundary transitions can reach a newly open lane without bouncing back',()=>{
 const s=setup(),c=driver(s,0,2500,20),changes=[0];let previous=0;
 for(const l of [1,2])s.signals[1][l].mode='closed';
 for(const l of [0,1])s.signals[2][l].mode='closed';
 for(let n=0;n<700&&c.x<2800;n++){
  stepSafe(s);if(c.lane!==previous){changes.push(c.lane);previous=c.lane;}
  if(c.x<GANTRIES[2]-30)assert.equal(c.lane,0);
 }
 assert(c.x>2750);assert.deepEqual(changes,[0,1,2]);
});
test('a stopped boundary merger keeps the newly open lane until it passes the gantry',()=>{
 for(const [lane,target] of [[0,1],[2,1]]){
  const s=setup(),c=driver(s,lane,2638,0),changes=[lane];let previous=lane;
  for(let l=0;l<3;l++){s.signals[1][l].mode=l===lane?'open':'closed';s.signals[2][l].mode=l===target?'open':'closed';}
  for(let n=0;n<500&&c.x<2750;n++){stepSafe(s);if(c.lane!==previous){changes.push(c.lane);previous=c.lane;}}
  assert(c.x>=2750);assert.deepEqual(changes,[lane,target]);assert.equal(c.transitionGantry,null);
 }
});


test('a driver already in its committed boundary lane does not ask that lane to yield',()=>{
 const s=setup(),c=driver(s,1,2640,0);
 for(let l=0;l<3;l++){s.signals[1][l].mode=l===0?'open':'closed';s.signals[2][l].mode=l===1?'open':'closed';}
 c.transitionGantry=2;c.evacuationGoal=1;c.cooldown=100;c.decision=100;
 stepSafe(s);assert.equal(c.lane,1);assert.equal(c.evacuationGoal,1);assert.equal(c.mergeRequest,null);
});
