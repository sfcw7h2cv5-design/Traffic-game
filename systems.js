// Scheduled network operations share the same individual-vehicle traffic model.
export class NetworkSystems {
 constructor(sim,{length,gantries}){
  this.sim=sim;this.length=length;this.gantries=gantries;
  this.ramps=[1200,5900,9000,11200,15900,19000].map((x,id)=>({id,x,offStart:Math.max(0,x-1750),offLength:id===0?340:850,offDeparture:id===0?220:300,joinTaper:200,name:'J'+(id+1),mode:'open',mergeLength:600,approachLength:1100,queue:[],nextArrival:12+id*9,lastRelease:-20,releasing:false,joined:0,exited:0}));
  this.phases=[{name:'Normal demand',multiplier:1,duration:90},{name:'Morning rush',multiplier:1.8,duration:180},{name:'Demand easing',multiplier:.75,duration:100},{name:'Stadium traffic',multiplier:2.2,duration:160},{name:'Normal demand',multiplier:1,duration:150}];
  this.phaseIndex=0;this.phase={...this.phases[0],endsAt:90};
  this.work={x:4200,length:150,lanes:[0],announceAt:45,startsAt:150,status:'scheduled',remaining:180,sceneId:null};
  this.roadblock={status:'scheduled',startsAt:110,x:1000,length:80,vehicleIds:[],sceneId:null,workEndsAt:null};
  this.totalExited=0;this.ambulancesExited=0;this.completedWorks=0;this.queueSeen=false;this.queueSeenAt=0;
  this.objectives=[{id:'flow',title:'Serve 100 vehicles',target:100,progress:0,complete:false},{id:'ambulance',title:'Get an ambulance through',target:1,progress:0,complete:false},{id:'queue',title:'Clear a queue of 5+ vehicles',target:1,progress:0,complete:false},{id:'works',title:'Complete protected roadworks',target:1,progress:0,complete:false}];
 }
 announce(text){this.sim.lastEvent=text;this.sim.eventId++;}
 setRampMode(id,mode){if(!['open','closed'].includes(mode)||!this.ramps[id])return false;this.ramps[id].mode=mode;return true;}
 rampTraffic(){return this.sim.cars.filter(c=>this.sim.occupiedLanes(c).includes(0));}
 rampCruise(ramp,traffic=this.rampTraffic()){
  const s=this.sim,car=ramp.queue[0],entry=ramp.x-ramp.mergeLength;
  let weighted=0,weight=0;
  for(const c of traffic){const d=Math.abs(c.x-entry);if(d>500)continue;const w=1/(50+d);weighted+=c.v*w;weight+=w;}
  const limit=s.signalAt(entry,0).speed*.44704;
  return Math.max(0,Math.min(car?.desired??limit,limit,weight?Math.max(2,weighted/weight):limit));
 }
 rampGap(ramp,{time=0,v=ramp.queue[0]?.v??0,traffic=this.rampTraffic(),car=ramp.queue[0],point=ramp.x-ramp.mergeLength,cooperative=false}={}){
  const s=this.sim,x=point;
  // Motorway signs guide lane changes after the joining taper; they are not
  // slip-road stop signals. Keep entry available while an onward lane is open.
  const next=this.gantries.findIndex(g=>g>ramp.x);
  if([0,1,2].every(l=>s.signalAt(ramp.x,l).mode==='closed')||next>=0&&this.gantries[next]-ramp.x<650&&s.signals[next].every(signal=>signal.mode==='closed'))return null;
  if(s.incidentBodies().some(i=>i.lane===0&&i.x>=x-(car?.length??5)-2&&i.x-i.length<=ramp.x+2))return null;
  if(s.cars.some(c=>c.lane<0&&Math.abs(c.x-x)<100))return null;
  let front=null,rear=null,frontX=Infinity,rearX=-Infinity;
  for(const c of traffic){
   const projected=c.x+c.v*time;
   if(projected>=x&&projected<frontX){front=c;frontX=projected;}
   else if(projected<x&&projected>rearX){rear=c;rearX=projected;}
  }
  // A merge must not make the priority traffic brake for a slower arrival.
  // Evaluate actual speed at transfer, and predicted speed only while planning.
  const creeping=cooperative&&v<4&&(rear?.v??0)<4;
  const frontNeeded=creeping?2+v*.75+Math.max(0,v-(front?.v??v))*1.25:8+v*1.2+Math.max(0,v-(front?.v??v))*3;
  let rearNeeded=creeping?2+(rear?.v??0)*.75+Math.max(0,(rear?.v??0)-v)*1.25:8+(rear?.v??0)*1.5+Math.max(0,(rear?.v??0)-v)*3;
  if(cooperative&&time===0&&rear&&car&&rear.yieldingFor===car.id&&rear.a<-.5){
   // The assigned helper is already braking to create this specific gap.
   // Use its conservative braking trajectory instead of pretending that it
   // will keep charging towards a stopped joiner at its original speed.
   const horizon=car.truck?5.5:4.5,brake=Math.min(1.5,-rear.a)*.8,brakingTime=Math.min(horizon,rear.v/brake);
   const rearTravel=rear.v*brakingTime-.5*brake*brakingTime*brakingTime;
   const frontSpace=front?Math.max(0,frontX-front.length-x-2)+front.v*horizon:Infinity;
   const joinTravel=Math.min(frontSpace,v*horizon+.5*Math.max(.2,(car.acceleration??1)*.6)*horizon*horizon);
   rearNeeded=Math.min(rearNeeded,4+Math.max(0,rearTravel-joinTravel)+rear.v*.5);
  }
  if(front&&frontX-front.length-x<frontNeeded)return null;
  if(rear&&x-(car?.length??5)-rearX<rearNeeded)return null;
  return {v,frontId:front?.id??null,rearId:rear?.id??null};
 }
 rampArrival(car,distance,target){
  const speed=Math.max(0,car.v),change=target-speed;
  if(distance<.001)return {time:0,speed};
  if(Math.abs(change)<.01)return {time:distance/Math.max(.1,speed),speed};
  const a=change>0?Math.max(.2,car.acceleration):-2;
  const transition=change/a,travel=(speed+target)*.5*transition;
  if(distance<=travel){const at=Math.sqrt(Math.max(0,speed*speed+2*a*distance));return {time:(at-speed)/a,speed:at};}
  return {time:transition+(distance-travel)/Math.max(.1,target),speed:target};
 }
 rampApproach(ramp,traffic){
  const entry=ramp.x-ramp.mergeLength,c=ramp.queue[0],distance=Math.max(0,c.rampDistance-ramp.mergeLength),cruise=this.rampCruise(ramp,traffic);
  const stopping=Math.sqrt(2*2*distance);
  if(ramp.mode!=='open')return Math.min(cruise,stopping);
  if(distance<.001)return this.rampGap(ramp,{traffic})?cruise:0;
  // Choose a moving gap using acceleration/deceleration-aware arrival times.
  // Retain the same front/rear pair while it remains reachable, so the target
  // does not jump from one gap to another as individual vehicles pass.
  const old=ramp.gapPlan?.carId===c.id?ramp.gapPlan:null,plans=[];
  for(const reduction of [0,1,2,3,5,7,10,14,18]){
   const target=Math.max(4,cruise-reduction),arrival=this.rampArrival(c,distance,target);
   if(arrival.time>45)continue;
   const gap=this.rampGap(ramp,{car:c,point:entry,time:arrival.time,v:arrival.speed,traffic});
   if(gap)plans.push({carId:c.id,frontId:gap.frontId,rearId:gap.rearId,target,arrival:arrival.time});
  }
  const retained=old&&plans.find(p=>p.frontId===old.frontId&&p.rearId===old.rearId);
  const plan=retained??plans[0];
  ramp.gapPlan=plan??null;
  return plan?plan.target:Math.min(cruise,stopping);
 }
 updateRampCourtesy(){
  const s=this.sim,requests=new Map(),traffic=this.rampTraffic();
  for(const ramp of this.ramps){
   const c=s.cars.find(c=>c.onRamp===ramp.id&&!c.rampMerging);if(!c||ramp.mode!=='open')continue;
   const entry=ramp.x-ramp.joinTaper,distance=entry-c.x;
   if(distance<25||distance>500)continue;
   const cruise=this.rampCruise(ramp,traffic),arrival=this.rampArrival(c,distance,cruise);
   if(arrival.time<3||arrival.time>20||cruise<8)continue;
   if(c.mergeRequest===0||c.accelGap?.target>=Math.max(8,cruise*.6))continue;
   // A usable moving gap needs no intervention. Otherwise only a rear driver
   // still well upstream may make a small, voluntary speed adjustment.
   if(this.rampGap(ramp,{car:c,point:entry,time:arrival.time,v:arrival.speed,traffic}))continue;
   let rear=null,rearAt=-Infinity;
   for(const car of traffic){
    const future=car.x+car.v*arrival.time;
    if(car.emergency||car.onRamp!=null||car.kind==='recovery'||car.lane!==0||Math.abs(car.visualLane-car.lane)>.02||car.x>entry-40||car.v<8||future>=entry)continue;
    if(future>rearAt){rear=car;rearAt=future;}
   }
   if(!rear||Math.abs(rear.x-c.x)<Math.max(15,c.length+rear.length+4))continue;
   const existing=requests.get(rear.id);
   if(!existing||entry<existing.entry)requests.set(rear.id,{rampId:ramp.id,entry});
  }
  for(const car of s.cars){
   const request=requests.get(car.id);
   if(!request){delete car.rampYieldId;delete car.rampYieldEntry;delete car.rampYieldTargetSpeed;delete car.rampYieldUntil;delete car.rampYieldBaseSpeed;continue;}
   const base=car.rampYieldId===request.rampId?car.rampYieldBaseSpeed:car.v;
   car.rampYieldId=request.rampId;car.rampYieldEntry=request.entry;car.rampYieldBaseSpeed=base;
   car.rampYieldTargetSpeed=Math.max(4,base-2.5);car.rampYieldUntil=s.elapsed+1;
  }
 }

 // In slow traffic, reserve one checked gap, then let one mainline car pass.
 // At speed, the existing moving-gap matching retains mainline priority.
 updateZipper(){
  const s=this.sim,traffic=this.rampTraffic();
  for(const c of s.cars){delete c.zipperYieldTarget;delete c.zipperYieldEntry;}
  for(const r of this.ramps){
   const c=s.cars.find(c=>c.onRamp===r.id&&!c.rampMerging),entry=r.x-r.joinTaper;
   if(r.zipperMain!=null){const main=s.cars.find(c=>c.id===r.zipperMain);if(!main||main.x>=entry){r.zipperTurn='ramp';r.zipperMain=null;}}
   if(!c||r.mode!=='open'||entry-c.x>80)continue;
   const rear=traffic.filter(c=>c.x<entry&&c.onRamp==null).sort((a,b)=>b.x-a.x)[0];
   if(!rear)continue;
   if(r.zipperTurn==='main'){r.zipperMain??=rear.id;continue;}
   if(c.mergeRequest===0||rear.emergency||rear.v>12||c.v>12)continue;
   // Open a rolling gap by easing one rear driver, never by adding a
   // stationary virtual stop line to an otherwise open motorway.
   if(rear.x<entry-c.length-4){
    const base=r.zipperRear===rear.id?r.zipperBaseSpeed:rear.v;
    r.zipperRear=rear.id;r.zipperBaseSpeed=base;
    rear.zipperYieldTarget=Math.max(.5,base-Math.min(2,base*.25));
    rear.zipperYieldEntry=entry;
   }
  }
 }
 updateOffRamps(){
  const s=this.sim;
  for(const c of s.cars){
   const previous=c.offRampScanX??c.x-5;c.offRampScanX=c.x;
   if(c.offRamp!=null){const r=this.ramps[c.offRamp];c.offProgress=Math.min(1,Math.max(0,(c.x-r.offStart)/r.offDeparture));continue;}
   if(c.lane!==0||c.onRamp!=null||c.emergency||c.kind||c.laneChange)continue;
   // Give each junction its own exit cohort. Detect crossing the start,
   // rather than requiring a vehicle to land inside a tiny coordinate window.
   const r=this.ramps.find(r=>(c.id+r.id)%4===0&&previous<=r.offStart&&c.x>=r.offStart);
   if(r){c.offRamp=r.id;c.offProgress=Math.min(1,Math.max(0,(c.x-r.offStart)/r.offDeparture));}
  }
  s.cars=s.cars.filter(c=>{if(c.offRamp==null||c.x<this.ramps[c.offRamp].offStart+this.ramps[c.offRamp].offLength)return true;this.ramps[c.offRamp].exited++;s.exits.push(s.elapsed);this.recordExit(c);return false;});
 }

 // Drive along the acceleration lane, then reserve the running lane only
 // when a real moving gap exists at the beginning of the joining taper.
 prepareRampMerges(dt){
  const s=this.sim,traffic=this.rampTraffic();
  for(const c of s.cars){
   if(c.onRamp==null)continue;
   if(c.rampMerging){
    const duration=c.rampSteerDuration??(c.truck?5.5:4.5);
    c.rampSteerProgress=Math.min(1,(c.rampSteerProgress??0)+dt/duration);
    if(c.rampSteerProgress>=1){
     c.onRamp=null;c.slipRamp=null;c.rampMerging=false;c.decision=0;
    }else{c.cooldown=Math.max(0,c.cooldown-dt);c.decision=Math.max(0,c.decision-dt);}
    continue;
   }
   c.cooldown=Math.max(0,c.cooldown-dt);c.decision=Math.max(0,c.decision-dt);
   const r=this.ramps[c.onRamp],point=r.x-r.joinTaper,distance=Math.max(0,point-c.x);
   const cruise=Math.min(c.desired,this.rampCruise(r)),plans=[];
   for(const reduction of [0,1,2,3,5,7,10,14,18]){
    const target=Math.max(2,cruise-reduction),arrival=this.rampArrival(c,distance,target);
    if(arrival.time>45)continue;
    const gap=this.rampGap(r,{car:c,point,time:arrival.time,v:arrival.speed,traffic,cooperative:true});
    if(gap)plans.push({...gap,target});
   }
   const retained=c.accelGap&&plans.find(p=>p.frontId===c.accelGap.frontId&&p.rearId===c.accelGap.rearId);
   c.accelGap=retained&&retained.target>=(plans[0]?.target??0)-2?retained:plans[0];
   c.accelTarget=c.accelGap?.target??Math.min(cruise,Math.sqrt(2*1.5*distance));
   if(c.mergeHelperId!=null&&!s.cars.some(o=>o.id===c.mergeHelperId&&o.lane===0&&o.onRamp==null&&o.x<c.x-c.length-2))delete c.mergeHelperId;
   const corridorOpen=r.mode==='open'&&!!this.rampGap(r,{car:c,point:c.x,v:0,traffic:[]});
   c.mergeRequest=corridorOpen&&(c.mergeHelperId!=null||!c.accelGap||c.accelTarget<Math.max(8,cruise*.7)||distance<80&&c.v<Math.max(2,cruise*.5))?0:null;
   if(c.x>=r.x-r.mergeLength&&r.mode==='open'&&this.rampGap(r,{car:c,point:c.x,v:c.v,traffic,cooperative:true})){
    c.rampMerging=true;c.rampSteerProgress=0;c.rampSteerDuration=c.truck?5.5:4.5;c.rampMergeStart=c.x;c.mergeHeadwayStart=c.x;c.mergeRequest=null;const helper=s.cars.find(o=>o.yieldingFor===c.id);if(helper)s.mergeTurns.set('ramp:'+r.id,{carId:helper.id,x:c.x,lane:0});delete c.mergeHelperId;r.zipperTurn='main';r.zipperMain=null;traffic.push(c);
   }
  }
 }

 updateRamps(dt){
  const s=this.sim;
  for(const r of this.ramps){
   if(s.elapsed>=r.nextArrival){
    const c=s.spawn(0,r.x-r.approachLength,12);s.cars.pop();
    const tail=r.queue.at(-1);c.rampDistance=Math.max(r.approachLength,tail?tail.rampDistance+tail.length+10:r.approachLength);c.slipRamp=r.id;c.v=12;r.queue.push(c);
    r.nextArrival=s.elapsed+(22+s.random()*10)/this.phase.multiplier;
   }
   if(!r.queue.length){r.releasing=false;continue;}
   const traffic=s.cars.filter(c=>c.onRamp===r.id),approach=r.mode==='open'?this.rampCruise(r):this.rampApproach(r,traffic);
   r.releasing=r.mode==='open'&&!!this.rampGap(r,{traffic});
   for(let i=0;i<r.queue.length;i++){
    const c=r.queue[i],leader=r.queue[i-1];
    const available=leader?Math.max(0,c.rampDistance-leader.rampDistance-leader.length-5):Math.max(0,c.rampDistance-r.mergeLength);
    const target=Math.min(c.desired,leader?Math.sqrt(2*1.5*available):approach);
    const next=Math.max(0,c.v+Math.max(-2.5,Math.min(c.acceleration,(target-c.v)*.8))*dt);
    const requested=Math.max(0,(c.v+next)*.5*dt),move=Math.min(available,requested);
    c.rampDistance-=move;c.x=r.x-c.rampDistance;
    c.v=!leader&&r.mode==='open'&&(r.releasing||approach>0)?next:move<requested?move/dt:next;
   }
  }
 }
 releaseRamps(){
  const s=this.sim;
  for(const r of this.ramps){
   const c=r.queue[0];
   if(!c||c.rampDistance>r.mergeLength+.001)continue;
   const gap=r.mode==='open'?this.rampGap(r,{traffic:s.cars.filter(c=>c.onRamp===r.id)}):null;
   if(!gap){c.v=0;r.releasing=false;continue;}
   // Mainline traffic has advanced first and keeps priority. Commit the car
   // once, retaining its matched speed instead of integrating it twice.
   r.queue.shift();c.x=r.x-c.rampDistance;c.onRamp=r.id;c.rampMerging=false;c.rampProgress=0;c.cooldown=8;c.decision=2;s.cars.push(c);
   r.releasing=true;r.lastRelease=s.elapsed;r.joined++;r.gapPlan=null;
  }
 }
 protectionGantry(){return this.gantries.findLastIndex(g=>g<this.work.x-this.work.length-50);}
 protectWorks(){
  const index=this.protectionGantry();if(index<0)return false;
  const s=this.sim;
  for(const lane of this.work.lanes){s.signals[index][lane].mode='closed';if(index>0)s.signals[index-1][lane].mode=[0,1,2].filter(l=>!this.work.lanes.includes(l)).sort((a,b)=>Math.abs(a-lane)-Math.abs(b-lane))[0]<lane?'merge-left':'merge-right';}
  for(const signal of s.signals[index])if(signal.mode==='open')signal.speed=Math.min(signal.speed,50);
  this.announce('Roadwork protection set. Let the work zone empty before crews enter.');return true;
 }
 updateWorks(dt){
  const s=this.sim;
  if(this.work.status==='complete'){
   if(s.elapsed<this.work.nextAt)return;
   const sites=[4200,7200,14200,17200];
   const next=sites[(sites.indexOf(this.work.x)+1)%sites.length];
   this.work={x:next,length:150,lanes:next%10000===7200?[1,2]:[0],announceAt:s.elapsed,startsAt:s.elapsed+100,status:'scheduled',remaining:180,sceneId:null};
  }
  const w=this.work;
  if(s.elapsed<w.announceAt)return;
  if(w.status==='scheduled'){w.status='announced';this.announce(`Roadworks due at ${(w.x/1000).toFixed(1)} km · prepare lane ${w.lanes[0]+1} closure at G${String(this.protectionGantry()+1).padStart(2,'0')}.`);}
  if(s.elapsed<w.startsAt)return;
  const protectedLanes=w.lanes.every(l=>s.signals[this.protectionGantry()][l].mode==='closed');
  const occupied=s.cars.some(c=>s.occupiedLanes(c).some(l=>w.lanes.includes(l))&&c.x>w.x-w.length-255&&c.x-c.length<w.x+5)||s.incidentBodies().some(i=>i.id!==w.sceneId&&w.lanes.includes(i.lane)&&i.x>w.x-w.length-255&&i.x-i.length<w.x+5);
  if(!w.sceneId&&w.sceneId!==0){
   if(!protectedLanes||occupied){w.status='awaiting-protection';return;}
   const scene={id:s.incidentId++,type:'roadworks',lane:w.lanes[0],lanes:[...w.lanes],x:w.x,length:w.length+250,bodies:w.lanes.map(lane=>({lane,x:w.x,length:w.length+250})),status:'crews-working',clearsAt:Infinity};
   s.incidents.push(scene);w.sceneId=scene.id;
  }
  w.status=protectedLanes?'working':'safety-paused';
  const scene=s.incidents.find(i=>i.id===w.sceneId);if(scene)scene.status=protectedLanes?'crews-working':'workers-withdrawn';
  if(protectedLanes)w.remaining=Math.max(0,w.remaining-dt);
  if(w.remaining===0){
   s.incidents=s.incidents.filter(i=>i.id!==w.sceneId);w.status='complete';w.nextAt=s.elapsed+300;this.completedWorks++;
   this.announce('Roadworks complete. Reopen your lane signals when ready.');
  }
 }
 updateRoadblock(){
  const s=this.sim,b=this.roadblock;
  if(b.status==='complete')return;
  if(b.status==='scheduled'&&s.elapsed>=b.startsAt){
   if(s.cars.some(c=>c.lane>=0&&c.x<130))return;
   b.status='rolling';
   for(let lane=0;lane<3;lane++){const c=s.spawn(lane,0,9,'roadblock');c.blocker=true;c.desired=9;c.v=9;c.cooldown=Infinity;c.decision=Infinity;c.acceleration=.8;b.vehicleIds.push(c.id);}
   this.announce('Police rolling roadblock · 20 mph across all lanes while a debris team makes the road safe.');
  }
  if(b.status==='rolling'){
   const occupied=s.cars.some(c=>!c.blocker&&c.lane>=0&&c.x>b.x-b.length-20&&c.x-c.length<b.x+30);
   const conflict=s.incidents.some(i=>Math.abs(i.x-b.x)<250);
   if(!occupied&&!conflict){
    const scene={id:s.incidentId++,type:'police-clearance',lane:0,lanes:[0,1,2],x:b.x,length:b.length,bodies:[0,1,2].map(lane=>({lane,x:b.x,length:b.length})),status:'crews-working',clearsAt:Infinity};
    s.incidents.push(scene);b.sceneId=scene.id;b.workEndsAt=s.elapsed+24;b.status='clearing';
   }
  }
  if(b.status==='clearing'&&s.elapsed>=b.workEndsAt){
   s.incidents=s.incidents.filter(i=>i.id!==b.sceneId);b.status='complete';
   for(const c of s.cars)if(b.vehicleIds.includes(c.id)){c.kind='police';c.blocker=false;c.emergency=true;c.desired=110*.44704;c.acceleration=3;c.headway=1.1;c.reaction=.35;c.courtesy=1;c.decision=0;c.cooldown=0;}
   this.announce('Debris clearance complete. Police rolling hold released; traffic may accelerate.');
  }
 }
 beforeStep(dt){
  const s=this.sim;
  if(s.elapsed>=this.phase.endsAt){this.phaseIndex=(this.phaseIndex+1)%this.phases.length;this.phase={...this.phases[this.phaseIndex],endsAt:s.elapsed+this.phases[this.phaseIndex].duration};this.announce(this.phase.name+' · entry and junction demand are changing.');}
  this.updateZipper();this.updateOffRamps();this.prepareRampMerges(dt);this.updateRamps(dt);this.updateRampCourtesy();this.updateWorks(dt);this.updateRoadblock();
 }
 recordExit(c){this.totalExited++;if(c.kind==='ambulance')this.ambulancesExited++;}
 afterStep(){
  this.releaseRamps();
  const stopped=this.sim.cars.filter(c=>c.lane>=0&&!c.emergency&&c.v<.5).length;
  if(stopped>=5&&!this.queueSeen){this.queueSeen=true;this.queueSeenAt=this.sim.elapsed;}
  const queueCleared=this.queueSeen&&stopped<=1&&this.sim.elapsed>this.queueSeenAt+20;
  for(const o of this.objectives){
   o.progress=Math.min(o.target,o.id==='flow'?this.totalExited:o.id==='ambulance'?this.ambulancesExited:o.id==='works'?this.completedWorks:queueCleared?1:0);
   if(o.progress>=o.target)o.complete=true;if(o.complete)o.progress=o.target;
  }
 }
}
