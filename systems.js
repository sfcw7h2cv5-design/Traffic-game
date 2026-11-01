// Scheduled network operations share the same individual-vehicle traffic model.
export class NetworkSystems {
 constructor(sim,{length,gantries}){
  this.sim=sim;this.length=length;this.gantries=gantries;
  this.ramps=[1200,5900,9000].map((x,id)=>({id,x,name:'J'+(id+1),mode:'open',queue:[],nextArrival:12+id*9,lastRelease:-20,releasing:false,joined:0}));
  this.phases=[{name:'Normal demand',multiplier:1,duration:90},{name:'Morning rush',multiplier:1.8,duration:180},{name:'Demand easing',multiplier:.75,duration:100},{name:'Stadium traffic',multiplier:2.2,duration:160},{name:'Normal demand',multiplier:1,duration:150}];
  this.phaseIndex=0;this.phase={...this.phases[0],endsAt:90};
  this.work={x:4200,length:150,lanes:[0],announceAt:45,startsAt:150,status:'scheduled',remaining:180,sceneId:null};
  this.roadblock={status:'scheduled',startsAt:110,x:1000,length:80,vehicleIds:[],sceneId:null,workEndsAt:null};
  this.totalExited=0;this.ambulancesExited=0;this.completedWorks=0;this.queueSeen=false;this.queueSeenAt=0;
  this.objectives=[{id:'flow',title:'Serve 100 vehicles',target:100,progress:0,complete:false},{id:'ambulance',title:'Get an ambulance through',target:1,progress:0,complete:false},{id:'queue',title:'Clear a queue of 5+ vehicles',target:1,progress:0,complete:false},{id:'works',title:'Complete protected roadworks',target:1,progress:0,complete:false}];
 }
 announce(text){this.sim.lastEvent=text;this.sim.eventId++;}
 setRampMode(id,mode){if(!['open','closed'].includes(mode)||!this.ramps[id])return false;this.ramps[id].mode=mode;return true;}
 rampGap(ramp){
  const s=this.sim,x=ramp.x-120;
  if(s.signalAt(x,0).mode!=='open'||this.gantries.some((g,i)=>g>x&&g-x<400&&s.signals[i][0].mode!=='open'))return null;
  if(s.incidentBodies().some(i=>i.lane===0&&Math.abs(i.x-x)<180))return null;
  if(s.cars.some(c=>c.lane<0&&Math.abs(c.x-x)<100))return null;
  const traffic=s.cars.filter(c=>s.occupiedLanes(c).includes(0));
  const front=traffic.filter(c=>c.x>=x).sort((a,b)=>a.x-b.x)[0];
  const rear=traffic.filter(c=>c.x<x).sort((a,b)=>b.x-a.x)[0];
  const v=Math.min(18,front?.v??18),car=ramp.queue[0];
  if(front&&front.x-front.length-x<8+v*1.5)return null;
  if(rear&&x-(car?.length??5)-rear.x<8+rear.v*1.5+Math.max(0,rear.v-v)*2)return null;
  return {v};
 }
 updateRamps(dt){
  const s=this.sim;
  for(const r of this.ramps){
   if(s.elapsed>=r.nextArrival){
    const c=s.spawn(0,r.x-700,12);s.cars.pop();
    const tail=r.queue.at(-1);c.rampDistance=Math.max(700,tail?tail.rampDistance+tail.length+10:700);c.slipRamp=r.id;c.v=12;r.queue.push(c);
    r.nextArrival=s.elapsed+(22+s.random()*10)/this.phase.multiplier;
   }
   const gap=this.rampGap(r);r.releasing=r.mode==='open'&&!!gap;
   for(let i=0;i<r.queue.length;i++){
    const c=r.queue[i],leader=r.queue[i-1];
    const available=leader?Math.max(0,c.rampDistance-leader.rampDistance-leader.length-5):Math.max(0,c.rampDistance-120);
    const target=Math.min(22,c.desired,leader?Math.sqrt(2*1.5*available):r.releasing?gap.v:Math.sqrt(2*1.5*available));
    const next=Math.max(0,c.v+Math.max(-2.5,Math.min(c.acceleration,(target-c.v)*.8))*dt);
    const move=Math.min(available,Math.max(0,(c.v+next)*.5*dt));
    c.rampDistance-=move;c.x=r.x-c.rampDistance;c.v=r.releasing&&!leader?next:move<Math.max(0,(c.v+next)*.5*dt)?move/dt:next;
   }
   if(r.releasing&&r.queue.length&&r.queue[0].rampDistance<=120.001){
    const c=r.queue.shift();c.x=r.x-c.rampDistance;c.v=Math.min(c.v,gap.v);c.onRamp=r.id;c.rampProgress=0;c.cooldown=8;c.decision=2;s.cars.push(c);
    r.lastRelease=s.elapsed;r.joined++;
   }
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
   const next=this.work.x===4200?7200:4200;
   this.work={x:next,length:150,lanes:next===7200?[1,2]:[0],announceAt:s.elapsed,startsAt:s.elapsed+100,status:'scheduled',remaining:180,sceneId:null};
  }
  const w=this.work;
  if(s.elapsed<w.announceAt)return;
  if(w.status==='scheduled'){w.status='announced';this.announce(`Roadworks due at ${(w.x/1000).toFixed(1)} km · prepare lane ${w.lanes[0]+1} closure at G0${this.protectionGantry()+1}.`);}
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
  this.updateRamps(dt);this.updateWorks(dt);this.updateRoadblock();
 }
 recordExit(c){this.totalExited++;if(c.kind==='ambulance')this.ambulancesExited++;}
 afterStep(){
  const stopped=this.sim.cars.filter(c=>c.lane>=0&&!c.emergency&&c.v<.5).length;
  if(stopped>=5&&!this.queueSeen){this.queueSeen=true;this.queueSeenAt=this.sim.elapsed;}
  const queueCleared=this.queueSeen&&stopped<=1&&this.sim.elapsed>this.queueSeenAt+20;
  for(const o of this.objectives){
   o.progress=Math.min(o.target,o.id==='flow'?this.totalExited:o.id==='ambulance'?this.ambulancesExited:o.id==='works'?this.completedWorks:queueCleared?1:0);
   if(o.progress>=o.target)o.complete=true;if(o.complete)o.progress=o.target;
  }
 }
}
