import {NetworkSystems} from './systems.js?v=37';
export const LENGTH = 20000;
// Keep the clipped top edge clear of incidents: outflow is always free.
export const EXIT_CLEAR_START = LENGTH - 500;
export const GANTRIES = [450, 1550, 2650, 3750, 4850, 6450, 8050, 10450, 11550, 12650, 13750, 14850, 16450, 18050];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Body clearance occurs before the departure curve is fully complete. Waiting
// for 100% progress can strand an exit car behind a motorway queue it has cleared.
function offLaneClear(c){return c.offRamp!=null&&(c.offProgress??0)>=.65;}
// Parallel acceleration/deceleration lanes are separate traffic corridors.
function vehicleLanes(c){
 if(c.onRamp!=null){
  if(!c.rampMerging)return [10+c.onRamp];
  return (c.rampSteerProgress??0)>=(c.truck?.9:.8)?[0]:[0,10+c.onRamp];
 }
 if(offLaneClear(c))return [20+c.offRamp];
 return Math.abs(c.visualLane-c.lane)>.2&&c.fromLane!==c.lane?[c.lane,c.fromLane]:[c.lane];
}
// Snapshot only fields used by neighbour queries. Driver state stays on the live
// vehicle; every following calculation still reads the same frozen time step.
function trafficSnapshot(cars){
  return cars.map(c=>({id:c.id,lane:c.lane,fromLane:c.fromLane,visualLane:c.visualLane,x:c.x,v:c.v,length:c.length,emergency:c.emergency,onRamp:c.onRamp,rampMerging:c.rampMerging,rampSteerProgress:c.rampSteerProgress,truck:c.truck,offRamp:c.offRamp,offProgress:c.offProgress}));
}
function trafficIndex(traffic){
  const lanes=new Map();
  for(let order=0;order<traffic.length;order++){
    const car=traffic[order],occupied=vehicleLanes(car);
    for(const lane of occupied){if(!lanes.has(lane))lanes.set(lane,[]);lanes.get(lane).push({car,order,back:car.x-car.length});}
  }
  for(const entries of lanes.values()){
    entries.sort((a,b)=>a.car.x-b.car.x||a.order-b.order);
    let first=null,second=null;
    const before=(a,b)=>!b||a.back<b.back||a.back===b.back&&a.order<b.order;
    for(let i=entries.length-1;i>=0;i--){
      const candidate=entries[i];
      if(before(candidate,first)){second=first;first=candidate;}else if(before(candidate,second))second=candidate;
      candidate.first=first;candidate.second=second;
    }
  }
  return lanes;
}
function indexedLeader(index,car,lane){
  const entries=index.get(lane);if(!entries)return null;
  let low=0,high=entries.length;
  while(low<high){const mid=(low+high)>>>1;if(entries[mid].car.x<car.x)low=mid+1;else high=mid;}
  if(low===entries.length)return null;
  const {first,second}=entries[low];
  return first.car.id===car.id?second:first;
}

export class Simulation {
  constructor(random = Math.random) {
    this.random = random;
    this.signals = GANTRIES.map(() => Array.from({ length: 3 }, () => ({ speed: 70, mode: 'open' })));
    this.cars = []; this.incidents = []; this.exits = [];this.mergeTurns=new Map();
    this.elapsed = 0; this.waiting = 0; this.id = 0; this.scenario = 'commute';
    this.nextArrival = 1 + random() * 3;
    this.nextIncident = 35 + random() * 30;
    this.eventId = 0; this.lastEvent = '';
    this.hardBrakeEvents=[];
    this.incidentZones=[];
    this.incidentId = 0; this.nextEmergency = 20 + random() * 25;
    this.systemsEnabled=true;this.systems=new NetworkSystems(this,{length:LENGTH,gantries:GANTRIES});
    // Stagger each lane independently; most traffic starts in the running lane.
    for (let lane = 0; lane < 3; lane++) {
      for (let x = 100 + random() * 120; x < LENGTH; x += [155, 330, 780][lane] + random() * 140) {
        this.spawn(lane, x, [25, 28, 30][lane] + random() * 2);
      }
    }
  }
  spawn(lane, x = 0, v = 0, kind = null) {
    const truck = !kind && lane < 2 && this.random() < (lane === 0 ? .26 : .10);
    const car = {
      id: this.id++, kind, emergency: kind === 'police' || kind === 'ambulance', lane, fromLane: lane, visualLane: lane, x, v,
      length: kind === 'recovery' ? 11 : kind === 'ambulance' ? 7 : truck ? 16.5 : 4.7, truck,
      desired: truck ? 23 + this.random() * 2 : 27 + this.random() * 6,
      headway: 1.8 + this.random() * .9,
      reaction: .65 + this.random() * .8,
      acceleration: truck ? .55 + this.random() * .25 : .9 + this.random() * .7,
      courtesy: .96 + this.random() * .06,
      reckless: this.random() < .08,
      cooldown: this.random() * 4, decision: this.random(),
      restart: 0, a: 0, braking: false, laneChange: null, laneChangeRate: 0,
    };
    if(kind==='roadblock'){car.desired=9;car.acceleration=.8;}
    if(car.emergency){car.desired=(kind==='police'?110:100)*.44704;car.acceleration=3;car.headway=1.1;car.reaction=.35;car.courtesy=1;car.cooldown=0;car.decision=0;}
    if(kind==='recovery'){car.desired=24;car.acceleration=.8;}
    car.v = Math.min(v, car.desired);
    this.cars.push(car);
    return car;
  }
  signalAt(x, lane) {
    if(lane<0)return {speed:55,mode:'open'};
    let i = -1;
    for (let j = 0; j < GANTRIES.length; j++) if (x >= GANTRIES[j]) i = j;
    return i < 0 ? { speed: 70, mode: 'open' } : this.signals[i][lane];
  }
  speedTarget(car) {
    if(car.emergency||offLaneClear(car))return car.desired;
    // A lower limit affects its whole downstream section. Drivers also see
    // approaching signs and brake comfortably before passing the gantry.
    let target = this.signalAt(car.x, car.lane).speed * .44704;
    // Use the braking envelope continuously, including before the old 400 m
    // cutoff. A hard cutoff caused an abrupt target drop at low posted limits.
    for(let g=0;g<GANTRIES.length;g++)if(GANTRIES[g]>car.x){
      const posted=this.signals[g][car.lane].speed*.44704;
      const distance=Math.max(0,GANTRIES[g]-car.x-15);
      target=Math.min(target,Math.sqrt(posted*posted+2*distance));
    }
    return target;
  }
  obstacle(car, lane, traffic = this.cars) {
    let pos = Infinity, speed = car.desired;
    const index=this._stepTrafficIndexes?.get(traffic);
    if(index){
      const leader=indexedLeader(index,car,lane);
      if(leader&&leader.back<pos){pos=leader.back;speed=leader.car.v;}
    }else for (const c of traffic) {
      const occupying = vehicleLanes(c).includes(lane);
      if (c.id !== car.id && occupying && c.x >= car.x && c.x - c.length < pos) {
        pos = c.x - c.length; speed = c.v;
      }
    }
    for (const i of this.incidentBodies()) if (i.lane === lane && i.x >= car.x && i.x - i.length < pos) {
      pos = i.x - i.length; speed = 0;
    }
    for (let g = 0; g < GANTRIES.length; g++) if (car.offRamp==null && lane>=0 && lane<3 && this.signals[g][lane].mode === 'closed' && car.x < GANTRIES[g] && GANTRIES[g] - 8 < pos) {
      pos = Math.max(car.x, GANTRIES[g] - 8); speed = 0;
    }
    if(car.blocker&&this.systemsEnabled&&['rolling','clearing'].includes(this.systems.roadblock.status)){const hold=this.systems.roadblock.x-this.systems.roadblock.length-100;if(car.x<hold&&hold<pos){pos=hold;speed=0;}}
    return { gap: Math.max(.1, pos - car.x), speed };
  }
  incidentWindows(){
    return GANTRIES.map((g,i)=>({start:g+350,end:Math.min(EXIT_CLEAR_START,(GANTRIES[i+1]??LENGTH+250)-350)}));
  }
  incidentPositionAllowed(x){
    return x>=150&&x<=EXIT_CLEAR_START&&GANTRIES.every(g=>Math.abs(x-g)>=350)&&this.incidents.every(i=>Math.abs(x-i.x)>=600);
  }
  nextIncidentPosition(){
    if(!this.incidentZones.length){
      this.incidentZones=GANTRIES.map((_,i)=>i);
      for(let i=this.incidentZones.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.incidentZones[i],this.incidentZones[j]]=[this.incidentZones[j],this.incidentZones[i]];}
    }
    const windows=this.incidentWindows();
    while(this.incidentZones.length){
      const w=windows[this.incidentZones.pop()];const x=w.start+10+this.random()*(w.end-w.start-20);
      if(this.incidentPositionAllowed(x))return x;
    }
    return null;
  }
  addIncident(lane = 0, x = 2200, type = 'breakdown', options = {}) {
    if(!this.incidentPositionAllowed(x)){
      const options=this.incidentWindows().map(w=>clamp(x,w.start+10,w.end-10)).filter(x=>this.incidentPositionAllowed(x)).sort((a,b)=>Math.abs(a-x)-Math.abs(b-x));
      if(!options.length)return null;x=options[0];
    }
    if (type === 'breakdown') lane = 0;
    // Use an actual vehicle where possible, preserving its position and appearance.
    const vehicle = this.cars.filter(c => c.lane === lane && c.v > 10 && !c.kind && c.onRamp==null && c.offRamp==null && Math.abs(c.visualLane-c.lane)<.02 && Math.abs(c.x-x)<350 && this.incidentPositionAllowed(c.x))
      .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    if(options.requireVehicle&&!vehicle)return null;
    if(!vehicle&&this.cars.some(c=>this.occupiedLanes(c).includes(lane)&&Math.abs(c.x-x)<40))return null;
    const incident = { id: this.incidentId++, vehicleId: vehicle?.id, lane, x: vehicle?.x ?? x, type, truck: vehicle?.truck ?? false,
      length: vehicle?.length ?? 4.7, started: this.elapsed,
      status: type==='breakdown'?'awaiting-recovery':'crews-working', dispatchAt: this.elapsed+5+this.random()*5,
      workDuration: 18+this.random()*12,
      clearsAt: type==='breakdown'?Infinity:this.elapsed+({debris:240,collision:420}[type]??300)+this.random()*120 };
    if (vehicle) this.cars = this.cars.filter(c => c.id !== vehicle.id);
    this.incidents.push(incident);
    this.lastEvent = `${type === 'breakdown' ? 'Broken-down ' + (incident.truck ? 'HGV' : 'car') : type === 'debris' ? 'Debris reported' : 'Collision reported'} · Lane ${lane + 1} · ${(incident.x / 1000).toFixed(2)} km. Set upstream warnings.`;
    this.eventId++;
    return incident;
  }
  laneHazardAhead(x,lane,distance=650){
    return this.incidentBodies().some(i=>i.lane===lane&&i.x>=x-25&&i.x-x<distance);
  }
  incidentBodies(){
    if(this._stepIncidentBodies)return this._stepIncidentBodies;
    return this.incidents.flatMap(i=>i.bodies?i.bodies.map((b,n)=>({...i,...b,bodyIndex:n,static:true,visualLane:b.lane,fromLane:b.lane})):[{...i,bodyIndex:0,static:true,visualLane:i.lane,fromLane:i.lane}]);
  }
  mergeTarget(mode,lane){
    if(mode==='merge-left')return lane-1;
    if(mode==='merge-right')return lane+1;
    return lane===2?1:lane+1;
  }
  addMultiLaneIncident(type,x,lanes=[0,1]){
    if(!['shed-load','pile-up'].includes(type)||lanes.length!==2||Math.abs(lanes[0]-lanes[1])!==1)return null;
    if(!this.incidentPositionAllowed(x))return null;
    let bodies=[],victims=[];
    if(type==='pile-up'){
      for(const lane of lanes){
        const car=this.cars.filter(c=>c.lane===lane&&!c.kind&&c.onRamp==null&&c.offRamp==null&&Math.abs(c.visualLane-c.lane)<.02&&Math.abs(c.x-x)<180&&this.incidentPositionAllowed(c.x)).sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x))[0];
        if(!car)return null;victims.push(car);bodies.push({lane,x:car.x,length:car.length,truck:car.truck,vehicleId:car.id});
      }
    }else{
      const candidates=[x,x-30,x+30,x-60,x+60,x-90,x+90].filter(pos=>this.incidentPositionAllowed(pos));
      const pos=candidates.find(pos=>!this.cars.some(c=>this.occupiedLanes(c).some(l=>lanes.includes(l))&&c.x>pos-28&&c.x-c.length<pos+4));
      if(pos==null)return null;x=pos;
      bodies=lanes.map(lane=>({lane,x,length:24,truck:false}));
    }
    const incident={id:this.incidentId++,type,lane:lanes[0],lanes:[...lanes],x,length:bodies[0].length,bodies,started:this.elapsed,status:'crews-working',clearsAt:this.elapsed+(type==='pile-up'?480:300)+this.random()*120};
    this.cars=this.cars.filter(c=>!victims.includes(c));this.incidents.push(incident);
    this.lastEvent=`${type==='pile-up'?'Multi-vehicle collision':'Shed load'} · Lanes ${lanes.map(l=>l+1).join(' & ')} · ${(x/1000).toFixed(2)} km. Protect both lanes upstream.`;this.eventId++;
    return incident;
  }
  mergeFlowTarget(car,lane,traffic){
    let front=null,rear=null;
    for(const other of traffic){
      if(other.id===car.id||!vehicleLanes(other).includes(lane))continue;
      if(other.x>=car.x&&other.x-car.x<250&&(!front||other.x<front.x))front=other;
      if(other.x<car.x&&car.x-other.x<150&&(!rear||other.x>rear.x))rear=other;
    }
    const posted=this.signalAt(car.x,lane).speed*.44704;
    const flow=front&&rear?(front.v*2+rear.v)/3:(front??rear)?.v??posted;
    return Math.max(2,Math.min(posted,flow));
  }
  usableArrowRoute(x,lane,source){
    const visited=new Set([source]);
    while(lane>=0&&lane<3&&!visited.has(lane)){
      visited.add(lane);const mode=this.signalAt(x,lane).mode;
      if(mode==='open')return true;
      if(!mode.startsWith('merge'))return false;
      lane=this.mergeTarget(mode,lane);
    }
    return false;
  }
  mergeSite(car,target){
    if(car.onRamp!=null)return 'ramp:'+car.onRamp;
    let g=GANTRIES.findIndex((x,i)=>x>=car.x-30&&this.signals[i][car.lane]?.mode==='closed');
    if(g<0)g=GANTRIES.findLastIndex((x,i)=>x<=car.x&&this.signals[i][car.lane]?.mode==='closed');
    const hazard=this.incidentBodies().filter(i=>i.lane===car.lane&&i.x>=car.x-25).sort((a,b)=>a.x-b.x)[0];
    return car.lane+'>'+target+':'+(g>=0?'g'+g:hazard?'i'+hazard.id:'a'+GANTRIES.findLastIndex(x=>x<=car.x));
  }
  occupiedLanes(c) {
    return vehicleLanes(c);
  }
  enforceSeparation() {
    // Reserve both lanes throughout a manoeuvre; enforce a physical bumper gap
    // after simultaneous integration, including at incidents and during towing.
    const obstacles=this.incidentBodies();
    for(let pass=0;pass<this.cars.length+1;pass++){
      let changed=false;
      // Fixed obstructions cannot be displaced by a merging vehicle's nose.
      for(const c of this.cars)for(const i of obstacles){
        if(!this.occupiedLanes(c).includes(i.lane))continue;
        if(c.x>=i.x-i.length-2&&c.x-c.length<i.x+2){
          const bound=i.x-i.length-2;
          if(c.x>bound+1e-8){c.x=bound;c.v=0;c.a=Math.min(0,c.a);changed=true;}
        }
      }
      const leaders=[],nearestBumper=new Map();
      for(const c of [...this.cars].sort((a,b)=>b.x-a.x||a.id-b.id)){
        const lanes=this.occupiedLanes(c);
        // Most vehicles already have a safe gap. Skip the all-pairs fallback
        // unless a processed leader's bumper actually constrains this vehicle.
        if(lanes.some(l=>c.x>(nearestBumper.get(l)??Infinity)+1e-8)){
          for(const leader of leaders)if(this.occupiedLanes(leader).some(l=>lanes.includes(l))){
            const safe=leader.x-leader.length-2;
            if(c.x>safe+1e-8){c.x=safe;c.v=Math.min(c.v,leader.v??0);c.a=Math.min(0,c.a);changed=true;}
          }
        }
        for(const lane of lanes)nearestBumper.set(lane,Math.min(nearestBumper.get(lane)??Infinity,c.x-c.length-2));
        leaders.push(c);
      }
      if(!changed)break;
    }
  }
  dispatchRecovery(incident) {
    if(!incident||incident.type!=='breakdown'||incident.status!=='awaiting-recovery')return false;
    // Recovery joins via the left hard shoulder, which is separate from traffic.
    let entry=0;const length=11+incident.length;
    for(let pass=0;pass<=this.cars.length;pass++){const occupied=this.cars.find(c=>c.lane===-1&&entry>c.x-c.length-2&&entry-length<c.x+2);if(!occupied)break;entry=occupied.x-occupied.length-2;}
    const tow=this.spawn(-1,entry,20,'recovery');
    tow.length+=incident.length;
    tow.recoveryTarget=incident.id;incident.status='recovery-en-route';
    this.lastEvent=`Recovery truck dispatched · Lane 1 · ${(incident.x/1000).toFixed(2)} km.`;this.eventId++;
    return true;
  }
  manageRecovery(dt) {
    for(const i of this.incidents){
      if(i.type!=='breakdown')continue;
      if(i.status==='awaiting-recovery'&&this.elapsed>=i.dispatchAt)this.dispatchRecovery(i);
      const tow=this.cars.find(c=>c.recoveryTarget===i.id);
      if(i.status==='recovery-en-route'&&tow&&tow.x>=i.x-25){
        tow.x=i.x-25;tow.v=0;tow.recovering=i.id;i.status='recovering';i.clearsAt=this.elapsed+i.workDuration;
        this.lastEvent='Recovery on scene · loading the broken-down vehicle.';this.eventId++;
      }
    }
    // The shoulder is only a route to an active recovery. Once loading has
    // finished, give way here and join the running lane through a real gap.
    for(const tow of this.cars){
      if(tow.kind==='recovery'&&tow.recoveryTarget!=null&&!this.incidents.some(i=>i.id===tow.recoveryTarget)){
        tow.recoveryTarget=null;tow.recovering=null;
      }
      if(tow.kind!=='recovery'||tow.lane>=0||tow.recoveryTarget!=null||tow.recovering!=null)continue;
      tow.needsRoadRejoin=true;
      if(this.signalAt(tow.x,0).mode==='closed')continue;
      const ahead=this.obstacle(tow,0),speed=Math.max(0,tow.v);
      if(ahead.gap<8+speed*1.5+Math.max(0,speed-ahead.speed)*4.5)continue;
      let rear=null;
      for(const car of this.cars)if(car.id!==tow.id&&this.occupiedLanes(car).includes(0)&&car.x<tow.x&&(!rear||car.x>rear.x))rear=car;
      const rearGap=rear?tow.x-tow.length-rear.x:Infinity;
      const requiredRear=rear?8+rear.v*1.5+Math.max(0,rear.v-speed)*4.5:0;
      if(rearGap<requiredRear)continue;
      tow.fromLane=-1;tow.lane=0;tow.visualLane=-1;
      tow.laneChange={from:-1,to:0,progress:0,duration:4.5};tow.laneChangeRate=0;
      tow.cooldown=8;tow.decision=1;tow.needsRoadRejoin=false;tow.mergeRequest=null;
    }
  }
  trafficAdvice(){
    const road=this.cars.filter(c=>c.lane>=0&&!c.emergency);
    const slow=road.filter(c=>c.v<5&&c.x>300).sort((a,b)=>a.x-b.x);
    let groups=[],group=[];
    for(const c of slow){if(group.length&&c.x-group.at(-1).x>200){if(group.length>=3)groups.push(group);group=[];}group.push(c);}
    if(group.length>=3)groups.push(group);
    groups.sort((a,b)=>b.length-a.length);
    const queue=groups[0];
    const tail=queue?queue[0].x:this.incidents.length?Math.min(...this.incidents.map(i=>i.x)):null;
    const gantry=tail==null?-1:GANTRIES.findLastIndex(g=>g<tail-(queue?100:250));
    return {kind:queue?'queue':tail!=null?'incident':'clear',tail,gantry,
      targetSpeed:queue?40:tail!=null?50:70,
      stopped:road.filter(c=>c.v<.5).length,slow:queue?.length??0,
      hardBrakes:this.hardBrakeEvents.filter(t=>t>this.elapsed-60).length};
  }
  step(dt) {
    this.elapsed += dt;
    if(this.systemsEnabled)this.systems.beforeStep(dt);
    this.manageRecovery(dt);
    if(this.elapsed>=this.nextEmergency){
      const lane=2;
      if(!this.cars.some(c=>this.occupiedLanes(c).includes(lane)&&c.x<100)){const type=this.random()<.5?'ambulance':'police';this.spawn(lane,0,30,type);this.lastEvent=(type==='ambulance'?'Ambulance':'Police car')+' on priority response · give it a clear route.';this.eventId++;}
      this.nextEmergency=this.elapsed+70+this.random()*80;
    }
    const cleared = this.incidents.filter(i => i.clearsAt <= this.elapsed);
    if (cleared.length) {
      this.incidents = this.incidents.filter(i => !(i.clearsAt <= this.elapsed));
      this.lastEvent = `Recovery complete · ${cleared.length} incident${cleared.length > 1 ? 's' : ''} cleared automatically. Check your signals and reopen lanes when safe.`;
      this.eventId++;
      for(const incident of cleared) {
        const tow=this.cars.find(c=>c.recovering===incident.id);
        if(tow){tow.recovering=null;tow.recoveryTarget=null;tow.towing=true;tow.cooldown=0;tow.needsRoadRejoin=true;}
      }
    }
    if (this.elapsed >= this.nextIncident) {
      if (this.incidents.length < 3) {
        const roll = this.random();
        const type = roll < .40 ? 'breakdown' : roll < .55 ? 'debris' : roll < .70 ? 'collision' : roll < .85 ? 'shed-load' : 'pile-up';
        const position=this.nextIncidentPosition();
        if(position!=null){if(type==='shed-load'||type==='pile-up')this.addMultiLaneIncident(type,position,this.random()<.65?[0,1]:[1,2]);else this.addIncident(type==='breakdown'?0:Math.floor(this.random()*3),position,type,{requireVehicle:type!=='debris'});}
      }
      this.nextIncident = this.elapsed + 110 + this.random() * 130;
    }
    const demand = { commute: .48, busy: 1.05, incident: .65, rain: .55, reckless: .65 }[this.scenario]*(this.systemsEnabled ? .75*this.systems.phase.multiplier : 1);
    this.nextArrival -= dt;
    while (this.nextArrival <= 0) {
      this.waiting++;
      this.nextArrival += (.6 + this.random() * 1.8) / demand;
    }
    // Entries prefer the left. Overflow can join lane 2 in heavier traffic.
    for (const lane of this.waiting > 4 ? [0, 1] : [0]) {
      if (!this.waiting || this.signalAt(0, lane).mode !== 'open') continue;
      const front = this.cars.filter(c => this.occupiedLanes(c).includes(lane)).sort((a, b) => a.x - b.x)[0];
      if (!front || front.x - front.length > Math.max(45, front.v * 2.5)) {
        this.spawn(lane, 0, front ? Math.min(22, front.v) : 23); this.waiting--;
      }
    }
    this._stepIncidentBodies=this.incidentBodies();
    this._stepTrafficIndexes=new Map();
    const rain = this.scenario === 'rain';
    // Freeze all leader positions/speeds for this step. Updating leaders first
    // makes followers react instantly and produces artificial synchronised motion.
    const snapshot=trafficSnapshot(this.cars);
    this._stepTrafficIndexes.set(snapshot,trafficIndex(snapshot));
    const sirens=snapshot.filter(c=>c.emergency);
    for (const c of this.cars) {
      if(c.recovering!=null||c.lane<0||c.onRamp!=null||c.offRamp!=null||c.blocker)continue;
      c.cooldown -= dt; c.decision -= dt;
      const sig = this.signalAt(c.x, c.lane);
      let front = this.obstacle(c, c.lane, snapshot);
      // A future merge arrow is advisory in its own downstream section. It
      // must not send traffic out of today's only open lane into a red X.
      const upcoming = GANTRIES.findIndex((x, g) => x > c.x && x - c.x < 650 && this.signals[g][c.lane].mode === 'closed');
      const hazard=this.laneHazardAhead(c.x,c.lane),currentClosed=sig.mode==='closed',advisory=sig.mode.startsWith('merge');
      const boundaryTransition=upcoming>=0&&GANTRIES[upcoming]-c.x<=30;
      const transitionIndex=c.transitionGantry??-1,transitionGoal=c.evacuationGoal;
      const transitionPlan=transitionIndex>=0&&transitionGoal!=null&&c.x<GANTRIES[transitionIndex]&&c.x>=GANTRIES[transitionIndex]-35&&this.signals[transitionIndex][transitionGoal].mode==='open';
      if(!transitionPlan)c.transitionGantry=null;
      const localRestriction=[0,1,2].some(l=>this.signalAt(c.x,l).mode==='closed'||this.laneHazardAhead(c.x,l))||GANTRIES.some((x,g)=>x>c.x&&x-c.x<650&&this.signals[g].some(s=>s.mode==='closed'));
      const mandatory=currentClosed||hazard,forced=mandatory||upcoming>=0||advisory||transitionPlan;
      const waitingRamp=this.cars.find(o=>o.id===c.yieldingFor&&o.onRamp!=null&&!o.rampMerging);
      const rampCourtesy=!c.emergency&&c.lane===0&&(waitingRamp||c.zipperYieldEntry!=null||c.x<(c.rampYieldEntry??-Infinity)&&this.elapsed<(c.rampYieldUntil??-Infinity));
      const approachingSiren=!c.emergency&&sirens.some(e=>e.emergency&&e.lane===c.lane&&e.x<c.x&&c.x-e.x<600);
      let destinations=[];
      if(transitionPlan){
        destinations=transitionGoal===c.lane?[]:[transitionGoal];
      }else if(mandatory){
        destinations=[0,1,2].filter(l=>l!==c.lane&&this.signalAt(c.x,l).mode==='open'&&!this.laneHazardAhead(c.x,l));
        if(boundaryTransition&&c.evacuationGoal!=null&&c.evacuationGoal!==c.lane&&this.signals[upcoming][c.evacuationGoal].mode==='open'&&!this.laneHazardAhead(c.x,c.evacuationGoal))destinations.push(c.evacuationGoal);
      }else if(upcoming>=0){
        // Prefer a lane usable on both sides of the gantry. If the only open
        // lane changes, wait at the boundary before crossing into the new lane.
        destinations=[0,1,2].filter(l=>l!==c.lane&&this.signals[upcoming][l].mode==='open'&&!this.laneHazardAhead(c.x,l)&&(this.signalAt(c.x,l).mode!=='closed'||boundaryTransition));
      }else if(advisory){
        // Follow arrows only through currently usable lanes towards an open
        // lane. Contradictory arrows or a closed destination mean "wait", not
        // repeated left/right manoeuvres.
        const visited=new Set([c.lane]);let lane=c.lane;
        while(true){
          const mode=this.signalAt(c.x,lane).mode;
          if(mode==='open'){destinations=[lane];break;}
          if(!mode.startsWith('merge'))break;
          const next=lane+Math.sign(this.mergeTarget(mode,lane)-lane);
          if(next<0||next>2||visited.has(next)||this.signalAt(c.x,next).mode==='closed'||this.laneHazardAhead(c.x,next))break;
          visited.add(next);lane=next;
        }
      }
      destinations.sort((a,b)=>Number(b===c.evacuationGoal)-Number(a===c.evacuationGoal)||Math.abs(a-c.lane)-Math.abs(b-c.lane));
      c.evacuationGoal=transitionPlan?transitionGoal:forced&&destinations.length?destinations[0]:null;
      if(boundaryTransition&&c.evacuationGoal!=null&&this.signals[upcoming][c.evacuationGoal].mode==='open')c.transitionGantry=upcoming;
      const evacuationSteps=c.evacuationGoal!=null&&c.evacuationGoal!==c.lane?[c.lane+Math.sign(c.evacuationGoal-c.lane)]:[];
      c.mergeRequest=evacuationSteps.length&&!c.laneChange&&Math.abs(c.visualLane-c.lane)<=.02?evacuationSteps[0]:null;
      if(c.mergeRequest==null)delete c.mergeHelperId;
      if (c.decision <= 0 && (c.cooldown <= 0 || forced || approachingSiren || c.emergency) && !c.laneChange && Math.abs(c.visualLane - c.lane) <= .02) {
        c.decision = (c.emergency||approachingSiren)?.25+this.random()*.25:.7+this.random()*.8;
        let target = c.lane;
        const safe = lane => {
          if(lane<0||lane>2)return false;
          const routeStep=forced&&evacuationSteps.includes(lane),escape=routeStep&&(mandatory||boundaryTransition);
          const laneMode=this.signalAt(c.x,lane).mode;
          if(lane<0||lane>2||(!escape&&this.laneHazardAhead(c.x,lane))||(c.truck&&lane===2&&!forced&&!localRestriction)||(laneMode==='closed'&&!escape)||(laneMode.startsWith('merge')&&!routeStep&&!this.usableArrowRoute(c.x,lane,c.lane)))return false;
          if(!escape&&GANTRIES.some((x,g)=>x>c.x&&x-c.x<650&&this.signals[g][lane].mode==='closed'))return false;
          let ahead = this.obstacle(c, lane, this.cars);
          if(escape&&lane!==c.evacuationGoal&&boundaryTransition&&this.signals[upcoming][lane].mode==='closed'){
            // A sideways crossing of an intermediate red-X lane still needs a
            // real traffic gap, but its virtual stop line is not a vehicle.
            let pos=LENGTH+1000,speed=c.desired;
            for(const o of this.cars)if(o.id!==c.id&&this.occupiedLanes(o).includes(lane)&&o.x>=c.x&&o.x-o.length<pos){pos=o.x-o.length;speed=o.v;}
            for(const i of this.incidentBodies())if(i.lane===lane&&i.x>=c.x&&i.x-i.length<pos){pos=i.x-i.length;speed=0;}
            ahead={gap:Math.max(.1,pos-c.x),speed};
          }
          let behind=null;
          for(const o of this.cars)if(o.id!==c.id&&this.occupiedLanes(o).includes(lane)&&o.x<c.x&&(!behind||o.x>behind.x))behind=o;
          const rearGap = behind ? c.x - c.length - behind.x : 1000;
          const rearNeeded = forced&&c.v<2&&(behind?.v??0)<2?1.99:behind ? 5 + behind.v * (forced ? .85 : 1.5) + Math.max(0, behind.v - c.v) * (forced ? 1.5 : 3) : 0;
          const horizon=forced||c.emergency?2:4;
          const futureFront=ahead.gap+Math.min(0,ahead.speed-c.v)*horizon;
          const futureRear=rearGap+Math.min(0,c.v-(behind?.v??c.v))*horizon;
          const overlapping=this.cars.some(o=>o.id!==c.id&&this.occupiedLanes(o).includes(lane)&&o.x>=c.x-c.length-1.99&&o.x-o.length<=c.x+1.99)||this.incidentBodies().some(i=>i.lane===lane&&i.x>=c.x-c.length-1.99&&i.x-i.length<=c.x+1.99);
          const frontNeeded=forced&&c.v<2?1.99:6+c.v*(forced?.85:1.8);
          return !overlapping&&futureFront>frontNeeded&&futureRear>rearNeeded;
        };
        if(approachingSiren&&c.lane>0&&safe(c.lane-1)){target=c.lane-1;}
        else if(c.kind==='recovery'&&c.recoveryTarget!=null&&c.lane>0&&safe(c.lane-1)){target=c.lane-1;}
        else if (forced) {
          const candidates=evacuationSteps;
          target = candidates.find(safe) ?? c.lane;
        } else {
          if(rampCourtesy&&c.cooldown<=0&&safe(c.lane+1)){target=c.lane+1;c.rampClearUntilX=(c.zipperYieldEntry??c.rampYieldEntry??waitingRamp?.x)+80;}
          // Return left unless actively passing a slower vehicle there.
          const left = c.lane - 1;
          if (target===c.lane && !c.emergency && left >= 0 && !(c.x<(c.rampClearUntilX??-Infinity)) && safe(left)) {
            const gap = this.obstacle(c, left, snapshot);
            const targetSpeed=Math.min(c.desired,this.speedTarget(c));
            const crowdedLeft=c.v<22&&gap.gap<Math.max(80,c.v*(c.headway+4));
            if (!crowdedLeft&&(gap.gap > Math.max(120, c.v * 8) || gap.speed >= targetSpeed - 1)) target = left;
          }
          const targetSpeed=Math.min(c.desired,this.speedTarget(c));
          const catching = front.gap < Math.max(95, c.v * 5.5) && front.speed < Math.min(targetSpeed - .7,c.v + .5);
          // A short gap after being overtaken is not a reason to pass a
          // faster vehicle that is already pulling away.
          const followingPressure = front.gap < Math.max(45,3.5+c.v*c.headway*1.8) && front.speed < Math.min(targetSpeed - .7,c.v + .5);
          if(c.emergency&&target===c.lane&&catching){
            const options=[c.lane-1,c.lane+1].filter(safe).sort((a,b)=>this.obstacle(c,b).gap-this.obstacle(c,a).gap);
            if(options.length)target=options[0];
          }
          if (target === c.lane && (catching||followingPressure) && safe(c.lane + 1)) {
            const right = this.obstacle(c, c.lane + 1, snapshot);
            if (right.gap > front.gap + (followingPressure?Math.max(20,front.gap*.45):20) || right.speed > front.speed + 2) target = c.lane + 1;
          }
        }
        if (target !== c.lane) {
          if(forced){
            // The safe-gap check has accepted a short cooperative merge.
            // Keep that gap initially, then open normal following distance
            // gradually, instead of immediately braking for a larger gap.
            c.mergeHeadwayStart=c.x;c.mergeHeadwayMin=1;c.mergeHeadwayDistance=300;
            const receiver=this.cars.find(o=>o.yieldingFor===c.id&&o.lane===target);
            if(receiver)this.mergeTurns.set(this.mergeSite(c,target),{carId:receiver.id,x:c.x,lane:target});
          }
          c.laneChange={from:c.visualLane,to:target,progress:0,duration:c.truck?5.5:4.5};
          c.fromLane = c.lane; c.lane = target; c.cooldown = 8 + this.random() * 4;c.mergeRequest=null;delete c.mergeHelperId;
        }
      }
    }
    // One waiting merger may ask its nearest rear neighbour to make space.
    // Vehicles already alongside it should continue, rather than brake for it.
    const yieldRequests=new Map(),requestedSites=new Set();
    for(const merger of [...this.cars].sort((a,b)=>b.x-a.x)){
      if(merger.mergeRequest==null)continue;
      const site=this.mergeSite(merger,merger.mergeRequest),turn=this.mergeTurns.get(site);
      if(turn){const main=this.cars.find(c=>c.id===turn.carId);if(main&&this.occupiedLanes(main).includes(turn.lane)&&main.x-main.length<turn.x)continue;this.mergeTurns.delete(site);}
      if(requestedSites.has(site))continue;
      const ahead=this.obstacle(merger,merger.mergeRequest);
      if(ahead.gap<(merger.v<2?2:6+merger.v*.85))continue;
      let receiver=this.cars.find(c=>c.id===merger.mergeHelperId&&!c.emergency&&c.onRamp==null&&c.offRamp==null&&c.lane===merger.mergeRequest&&c.x<merger.x-merger.length-2);
      for(const c of receiver?[]:this.cars){
        if(c.id===merger.id||c.emergency||c.onRamp!=null||c.offRamp!=null||c.lane!==merger.mergeRequest||c.x>=merger.x-merger.length-2||merger.x-c.x>350)continue;
        const gap=merger.x-merger.length-c.x,target=Math.max(.5,merger.v+(merger.onRamp!=null?0:1));
        // A stopped merger needs room for braking response as well as distance.
        const neededToEase=c.v>merger.v+5?Math.max(12,(c.v*c.v-target*target)/(2*1.5)+c.v*(merger.v<2?2.5:.5)):2;
        if(gap<neededToEase)continue;
        if(!receiver||c.x>receiver.x)receiver=c;
      }
      if(!receiver||yieldRequests.has(receiver.id))continue;
      // A vehicle alongside the merger will pass first; don't slow somebody
      // behind that vehicle to reserve a gap the merger cannot yet reach.
      const alongside=this.cars.some(c=>c.id!==merger.id&&c.id!==receiver.id&&this.occupiedLanes(c).includes(merger.mergeRequest)&&c.x>=merger.x-merger.length-2&&c.x-c.length<=merger.x+2);
      if(alongside&&merger.onRamp==null&&merger.mergeHelperId!==receiver.id)continue;
      const gap=merger.x-merger.length-receiver.x;
      const needed=5+receiver.v*.9+Math.max(0,receiver.v-merger.v)*2;
      const passingBeforeGap=this.cars.some(c=>c.id!==merger.id&&c.id!==receiver.id&&this.occupiedLanes(c).includes(merger.mergeRequest)&&c.x>receiver.x&&c.x<merger.x);
      if(gap<needed+8||passingBeforeGap||merger.mergeHelperId===receiver.id){yieldRequests.set(receiver.id,merger.id);requestedSites.add(site);merger.mergeHelperId=receiver.id;}
    }
    const movementSnapshot=trafficSnapshot(this.cars);
    this._stepTrafficIndexes.set(movementSnapshot,trafficIndex(movementSnapshot));
    for(const c of this.cars){
      if(c.onRamp!=null){const ramp=this.systems.ramps[c.onRamp],join=ramp.x;c.rampProgress=Math.max(0,Math.min(1,(c.x-(join-ramp.mergeLength))/ramp.mergeLength));if(c.x>=join){c.onRamp=null;c.slipRamp=null;c.rampMerging=false;}}
      if(c.recovering!=null){c.v=0;continue;}
      if(c.lane<0){
        if(c.kind==='recovery'&&c.recoveryTarget==null){c.v=0;c.a=0;continue;}
        const front=this.obstacle(c,c.lane,movementSnapshot);
        c.v=Math.min(c.desired,c.v+c.acceleration*dt);
        const berth=this.incidents.find(i=>i.id===c.recoveryTarget);
        const remaining=berth?Math.max(0,berth.x-25-c.x):Infinity;
        c.x+=Math.min(remaining,Math.max(0,front.gap-2),c.v*dt);continue;
      }
      const drivingLane=c.onRamp!=null&&!c.rampMerging?10+c.onRamp:offLaneClear(c)?20+c.offRamp:c.lane;
      let front=this.obstacle(c,drivingLane,movementSnapshot);
      if(c.onRamp!=null&&!c.rampMerging){
       const r=this.systems.ramps[c.onRamp],end=r.x-r.joinTaper;
       const available=Math.max(.1,end-c.x);
       if(!c.accelGap&&available<front.gap)front={gap:available,speed:0};
      }

      if (Math.abs(c.visualLane - c.lane) > .2) {
        const oldFront = this.obstacle(c, c.fromLane, movementSnapshot);
        if (oldFront.gap < front.gap) front = oldFront;
      }
      const unruly = this.scenario === 'reckless' && c.reckless;
      const limit = this.speedTarget(c);
      let desired = Math.max(3, Math.min(c.desired * (rain ? .82 : 1), limit * c.courtesy * (unruly ? 1.15 : 1)));
      if(!c.emergency&&c.lane===0&&c.x<(c.rampYieldEntry??-Infinity)&&this.elapsed<(c.rampYieldUntil??-Infinity))desired=Math.min(desired,Math.max(4,c.rampYieldTargetSpeed??desired));
      if(!c.emergency&&c.zipperYieldTarget!=null)desired=Math.min(desired,c.zipperYieldTarget);
      if(c.onRamp!=null&&!c.rampMerging)desired=Math.min(desired,c.accelTarget??desired);
      if(offLaneClear(c)){
       const r=this.systems.ramps[c.offRamp],remaining=Math.max(0,r.offStart+r.offLength-c.x);
       desired=Math.min(desired,Math.sqrt(12*12+2*1.5*remaining));
      }
      const yielding=yieldRequests.has(c.id);
      const request=yielding?yieldRequests.get(c.id):null;
      if(request!==c.yieldingFor)c.mergeYieldBase=c.v;
      c.yieldingFor=request;

      // A driver initially accepts the checked joining gap, then opens their
      // normal following distance progressively along the acceleration lane.
      const initialHeadway=Math.min(c.headway,c.mergeHeadwayMin??1.2);
      const mergeHeadway=c.mergeHeadwayStart!=null?initialHeadway+(c.headway-initialHeadway)*clamp((c.x-c.mergeHeadwayStart)/(c.mergeHeadwayDistance??600),0,1):c.headway;
      const headway = mergeHeadway * (rain ? 1.35 : unruly ? .65 : 1);
      const closing = c.v - front.speed;
      const wanted = 3.5 + Math.max(0, c.v * headway + c.v * closing / (2 * Math.sqrt(c.acceleration * 2)));
      let acceleration = c.acceleration * (1 - (c.v / desired) ** 4 - (wanted / front.gap) ** 2);
      if(yielding&&!c.emergency){
        const merger=this.cars.find(o=>o.id===request);
        const target=Math.max(.4,Math.min((c.mergeYieldBase??c.v)-2,(merger?.v??c.v)+(merger?.onRamp!=null?0:1)));
        // Courtesy opens a rolling gap with comfortable braking; following
        // and real obstructions can still require stronger deceleration.
        acceleration=Math.min(acceleration,clamp((target-c.v)*.6,-1.5,c.acceleration));
      }
      if(c.mergeRequest!=null&&c.onRamp==null&&!c.laneChange){
        // Match the lane being joined while still looking for a gap. Holding
        // the source lane's higher speed until the red X creates a needless
        // stop, then inserts a stationary car into an otherwise moving queue.
        const target=this.mergeFlowTarget(c,c.mergeRequest,movementSnapshot);
        acceleration=Math.min(acceleration,clamp((target-c.v)*.5,-1.5,c.acceleration));
      }
      // Each stopped driver waits their own reaction time as the queue releases.
      if (c.v < .4 && front.speed < .3 && front.gap < 5.5) c.restart = c.reaction;
      else c.restart = Math.max(0, c.restart - dt);
      if (c.restart > 0 && c.v < .4) acceleration = Math.min(0, acceleration);
      const targetA = clamp(acceleration, -6, c.acceleration);
      c.a += (targetA - c.a) * Math.min(1, dt / (targetA < -2 ? .18 : c.reaction));
      const hardBraking=c.a < -2.5;
      if(hardBraking&&!c.hardBraking&&!c.emergency)this.hardBrakeEvents.push(this.elapsed);
      c.hardBraking=hardBraking;
      const nextV = Math.max(0, c.v + c.a * dt);
      const requested = Math.max(0, (c.v + nextV) * .5 * dt);
      const rampBound=c.onRamp!=null&&!c.rampMerging?Math.max(0,this.systems.ramps[c.onRamp].x-this.systems.ramps[c.onRamp].joinTaper-2-c.x):Infinity;
      const move = Math.min(Math.max(0, front.gap - 2), requested,rampBound);
      c.x += move; c.v = move < requested ? move / dt : nextV;
      c.braking = c.a < -.6;
      // Steering eases into and out of a committed manoeuvre. Keep a bounded
      // time profile at walking pace too, so a stopped driver can escape a red X
      // without disabling the original lane's bumper protection.
      if(!c.laneChange&&Math.abs(c.visualLane-c.lane)>1e-7)c.laneChange={from:c.visualLane,to:c.lane,progress:0,duration:c.truck?5.5:4.5};
      const turn=c.laneChange;
      if(turn){
        turn.progress=Math.min(1,turn.progress+dt/turn.duration);
        const t=turn.progress,ease=t*t*t*(10+t*(-15+6*t));
        c.visualLane=turn.from+(turn.to-turn.from)*ease;
        c.laneChangeRate=(turn.to-turn.from)*30*t*t*(1-t)*(1-t)/turn.duration;
        if(t>=1){c.visualLane=turn.to;c.laneChangeRate=0;c.laneChange=null;}
      }else c.laneChangeRate=0;
    }
    this.enforceSeparation();
    this.cars = this.cars.filter(c => {
      if (c.x > LENGTH) { this.exits.push(this.elapsed);if(this.systemsEnabled)this.systems.recordExit(c); return false; } return true;
    });
    this.exits = this.exits.filter(t => t > this.elapsed - 60);
    this.hardBrakeEvents=this.hardBrakeEvents.filter(t=>t>this.elapsed-60);
    this._stepIncidentBodies=null;this._stepTrafficIndexes=null;
    if(this.systemsEnabled)this.systems.afterStep();
  }
}
