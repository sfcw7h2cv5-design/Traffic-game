import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNetworkProjection} from './projection.js';
const GANTRIES=[450,1550,2650,3750,4850,6450,8050];
const iconHeight=c=>c.towing||c.kind==='recovery'?7.6:c.truck?6.6:c.kind==='ambulance'?5.1:c.emergency||c.blocker?4.6:3.6;
function options(extra={}){return {length:10000,height:940,iconHeight,gap:.6,gantries:GANTRIES,minGantrySpacing:45,...extra};}
function stoppedQueue(count,lane=0,start=9200,mixed=true){
 const cars=[];let x=start;
 for(let id=0;id<count;id++){
  const truck=mixed&&id%5===0,kind=mixed&&id%61===1?'police':mixed&&id%67===2?'ambulance':null;
  const length=kind==='ambulance'?7:truck?16.5:4.7;
  cars.push({id,x,lane,visualLane:lane,fromLane:lane,truck,kind,length,emergency:!!kind});
  x-=length+2;
 }
 return cars;
}
function assertLaneSpacing(cars,p){
 const lanes=new Map();
 for(const c of cars){
  const occupied=Math.abs(c.visualLane-c.lane)>.2?[c.lane,c.fromLane]:[c.lane];
  for(const lane of new Set(occupied)){if(!lanes.has(lane))lanes.set(lane,[]);lanes.get(lane).push(c);}
 }
 for(const list of lanes.values()){
  list.sort((a,b)=>b.x-a.x);
  for(let n=0;n<list.length-1;n++){const front=list[n],back=list[n+1];assert(p.project(back.x)-p.project(front.x)>=iconHeight(front)+.6-1e-7,'queue icons overlapped');}
 }
}
test('empty network keeps the original full-network camera and has a reversible monotone map',()=>{
 const p=createNetworkProjection([],[],options());
 assert.equal(p.requiredHeight,940);assert.equal(p.project(0),964);assert.equal(p.project(10000),-24);
 for(let x=-200;x<10200;x+=37){assert(p.project(x)>p.project(x+1));assert(Math.abs(p.unproject(p.project(x))-x)<1e-7);assert(p.scaleAt(x)>0);}
});
test('540 mixed stopped vehicles stay single-file and fit a modest shared road height',()=>{
 const cars=[...stoppedQueue(180,0),...stoppedQueue(180,1).map(c=>({...c,id:c.id+1000})),...stoppedQueue(180,2).map(c=>({...c,id:c.id+2000}))];
 const p=createNetworkProjection(cars,[],options());
 assertLaneSpacing(cars,p);assert.equal(p.conflicts.length,0);assert(p.requiredHeight<=1150);
 for(let n=0;n<GANTRIES.length-1;n++)assert(p.project(GANTRIES[n])-p.project(GANTRIES[n+1])>=45-1e-7);
 assert(p.project(GANTRIES[0])<=p.requiredHeight-20);assert(p.project(GANTRIES.at(-1))>=20);
 assert.equal(p.project(10000),-24);assert.equal(p.project(0),p.requiredHeight+24);
});
test('a full single-lane queue increases canvas height instead of shrinking or hiding any vehicle',()=>{
 const cars=stoppedQueue(540,0,9900,false),p=createNetworkProjection(cars,[],options());
 assertLaneSpacing(cars,p);assert(p.requiredHeight>2000);assert.equal(p.knots.length,cars.length+GANTRIES.length+2);
 assert(cars.every(c=>Number.isFinite(p.project(c.x))));assert(p.project(10000)<p.project(0));
});
test('lane-change reservations protect both the departing and destination lane',()=>{
 const cars=[{id:1,x:3000,lane:1,fromLane:0,visualLane:.5,length:4.7},{id:2,x:2993.3,lane:0,fromLane:0,visualLane:0,length:4.7},{id:3,x:2986.6,lane:1,fromLane:1,visualLane:1,length:4.7}];
 const p=createNetworkProjection(cars,[],options());
 assertLaneSpacing(cars,p);assert.equal(p.conflicts.length,0);
});
test('static incident bodies protect queues while roadwork and clearance cones do not consume icon space',()=>{
 const car={id:1,x:2981.5,lane:0,fromLane:0,visualLane:0,length:4.7};
 const incident={id:10,x:3000,lane:0,type:'breakdown',truck:true,length:16.5};
 const p=createNetworkProjection([car],[incident],options());
 assert(p.project(car.x)-p.project(incident.x)>=iconHeight(incident)+.6-1e-7);
 const plain=createNetworkProjection([],[],options()),works=createNetworkProjection([],[{...incident,type:'roadworks'},{...incident,type:'police-clearance'}],options());
 assert.equal(plain.key,works.key);
});
test('private slip-road queues have their own corridor and share ordering with joining vehicles',()=>{
 const queue=stoppedQueue(20,0,5700,false).map(c=>({...c,slipRamp:1}));
 const joining={id:100,x:5710,lane:0,fromLane:0,visualLane:0,length:4.7,onRamp:1,slipRamp:1};
 const main={id:101,x:5717,lane:0,fromLane:0,visualLane:0,length:4.7};
 const p=createNetworkProjection([joining,main],[],options({ramps:[{id:1,x:5900,queue}]}));
 assert(p.project(queue[0].x)-p.project(joining.x)>=iconHeight(joining)+.6-1e-7);
 assert(p.project(joining.x)-p.project(main.x)>=iconHeight(main)+.6-1e-7);
 // Queued traffic can travel alongside motorway traffic at the same world x.
 const alongside={id:200,x:queue[0].x,lane:0,fromLane:0,visualLane:0,length:4.7};
 const parallel=createNetworkProjection([alongside],[],options({ramps:[{id:1,x:5900,queue}]}));
 assert.equal(parallel.conflicts.length,0);
});
test('small continuous vehicle movements do not make the road projection jump',()=>{
 const cars=stoppedQueue(180),before=createNetworkProjection(cars,[],options());
 for(const c of cars)c.x+=.01;
 const after=createNetworkProjection(cars,[],options());
 for(let x=0;x<=10000;x+=25)assert(Math.abs(before.project(x)-after.project(x))<.1);
 assert.notEqual(before.key,after.key);assertLaneSpacing(cars,after);
});
test('off-network traffic does not stretch the road or consume visible map space',()=>{
 const baseline=createNetworkProjection([],[],options());
 const arrivals=createNetworkProjection([{id:1,x:-2000,lane:0,length:5},{id:2,x:12000,lane:0,length:5}],[],options());
 assert.equal(arrivals.key,baseline.key);
});


test('compressed clear stretches keep enough room for gentle slip-road joins',()=>{
 const ramps=[{id:0,x:1200,mergeLength:600,approachLength:1100,queue:[]},{id:1,x:5900,mergeLength:600,approachLength:1100,queue:[]}];
 const cars=Array.from({length:200},(_,id)=>({id,x:9200-id*6.7,lane:0,visualLane:0,length:4.7}));
 const p=createNetworkProjection(cars,[],{height:940,ramps});
 for(const r of ramps){assert(p.project(r.x-r.mergeLength)-p.project(r.x)>=80-1e-7);assert(p.project(r.x-r.approachLength)-p.project(r.x-r.mergeLength)>=40-1e-7);}
});
