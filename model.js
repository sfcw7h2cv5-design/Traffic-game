export const LENGTH = 6000;
export const GANTRIES = [450, 1550, 2650, 3750, 4850];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export class Simulation {
  constructor(random = Math.random) {
    this.random = random;
    this.signals = GANTRIES.map(() => Array.from({ length: 3 }, () => ({ speed: 70, mode: 'open' })));
    this.cars = []; this.incidents = []; this.exits = [];
    this.elapsed = 0; this.waiting = 0; this.id = 0; this.scenario = 'commute';
    this.nextArrival = 1 + random() * 3;
    this.nextIncident = 35 + random() * 30;
    this.eventId = 0; this.lastEvent = '';
    this.incidentZones=[];
    this.incidentId = 0; this.nextEmergency = 20 + random() * 25;
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
      restart: 0, a: 0, braking: false,
    };
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
    if(car.emergency)return car.desired;
    // A lower limit affects its whole downstream section. Drivers also see
    // approaching signs and brake comfortably before passing the gantry.
    let target = this.signalAt(car.x, car.lane).speed * .44704;
    const next = GANTRIES.findIndex(x => x > car.x);
    if (next >= 0 && GANTRIES[next] - car.x < 400) {
      const posted = this.signals[next][car.lane].speed * .44704;
      const distance = Math.max(0, GANTRIES[next] - car.x - 15);
      target = Math.min(target, Math.sqrt(posted * posted + 2 * 1.5 * distance));
    }
    return target;
  }
  obstacle(car, lane, traffic = this.cars) {
    let pos = LENGTH + 1000, speed = car.desired;
    for (const c of traffic) {
      const occupying = c.lane === lane || (Math.abs(c.visualLane - c.lane) > .02 && c.fromLane === lane);
      if (c.id !== car.id && occupying && c.x >= car.x && c.x - c.length < pos) {
        pos = c.x - c.length; speed = c.v;
      }
    }
    for (const i of this.incidentBodies()) if (i.lane === lane && i.x >= car.x && i.x - i.length < pos) {
      pos = i.x - i.length; speed = 0;
    }
    for (let g = 0; g < GANTRIES.length; g++) if (lane>=0 && this.signals[g][lane].mode === 'closed' && car.x < GANTRIES[g] && GANTRIES[g] - 8 < pos) {
      pos = Math.max(car.x, GANTRIES[g] - 8); speed = 0;
    }
    return { gap: Math.max(.1, pos - car.x), speed };
  }
  incidentWindows(){
    return GANTRIES.map((g,i)=>({start:g+350,end:Math.min(LENGTH-150,(GANTRIES[i+1]??LENGTH+250)-350)}));
  }
  incidentPositionAllowed(x){
    return x>=150&&x<=LENGTH-150&&GANTRIES.every(g=>Math.abs(x-g)>=350)&&this.incidents.every(i=>Math.abs(x-i.x)>=600);
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
    const vehicle = this.cars.filter(c => c.lane === lane && c.v > 10 && !c.kind && Math.abs(c.visualLane-c.lane)<.02 && Math.abs(c.x-x)<350 && this.incidentPositionAllowed(c.x))
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
  incidentBodies(){
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
        const car=this.cars.filter(c=>c.lane===lane&&!c.kind&&Math.abs(c.visualLane-c.lane)<.02&&Math.abs(c.x-x)<180&&this.incidentPositionAllowed(c.x)).sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x))[0];
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
  occupiedLanes(c) {
    return Math.abs(c.visualLane-c.lane)>.02?[c.lane,c.fromLane]:[c.lane];
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
      const leaders=[];
      for(const c of [...this.cars].sort((a,b)=>b.x-a.x||a.id-b.id)){
        const lanes=this.occupiedLanes(c);
        for(const leader of leaders)if(this.occupiedLanes(leader).some(l=>lanes.includes(l))){
          const safe=leader.x-leader.length-2;
          if(c.x>safe+1e-8){c.x=safe;c.v=Math.min(c.v,leader.v??0);c.a=Math.min(0,c.a);changed=true;}
        }
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
  }
  step(dt) {
    this.elapsed += dt;
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
        if(tow){tow.recovering=null;tow.recoveryTarget=null;tow.towing=true;tow.cooldown=0;}
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
    const demand = { commute: .48, busy: 1.05, incident: .65, rain: .55, reckless: .65 }[this.scenario];
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
    const rain = this.scenario === 'rain';
    // Freeze all leader positions/speeds for this step. Updating leaders first
    // makes followers react instantly and produces artificial synchronised motion.
    const snapshot = this.cars.map(c => ({ ...c }));
    for (const c of this.cars) {
      if(c.recovering!=null||c.lane<0)continue;
      c.cooldown -= dt; c.decision -= dt;
      const sig = this.signalAt(c.x, c.lane);
      let front = this.obstacle(c, c.lane, snapshot);
      const upcoming = GANTRIES.findIndex((x, g) => x > c.x && x - c.x < 650 && this.signals[g][c.lane].mode !== 'open');
      const warning = sig.mode!=='open'?sig:upcoming>=0?this.signals[upcoming][c.lane]:sig;
      const approachingSiren=!c.emergency&&snapshot.some(e=>e.emergency&&e.lane===c.lane&&e.x<c.x&&c.x-e.x<600);
      const forced = sig.mode !== 'open' || upcoming >= 0 || (front.gap < 160 && front.speed < 3);
      // Plan a route to an actually open lane, one adjacent lane at a time.
      // Two adjacent red Xs must not strand a driver in the inner closed lane.
      const destinations=[0,1,2].filter(l=>l!==c.lane&&(sig.mode!=='open'||upcoming<0?this.signalAt(c.x,l).mode==='open':this.signals[upcoming][l].mode==='open'));
      const preferred=warning.mode.startsWith('merge')?Math.sign(this.mergeTarget(warning.mode,c.lane)-c.lane):0;
      destinations.sort((a,b)=>{
        const pa=preferred&&Math.sign(a-c.lane)!==preferred?1:0,pb=preferred&&Math.sign(b-c.lane)!==preferred?1:0;
        return pa-pb||Math.abs(a-c.lane)-Math.abs(b-c.lane);
      });
      const evacuationSteps=[...new Set(destinations.map(l=>c.lane+Math.sign(l-c.lane)))];
      if (c.decision <= 0 && (c.cooldown <= 0 || forced || approachingSiren || c.emergency) && Math.abs(c.visualLane - c.lane) <= .02) {
        c.decision = (c.emergency||approachingSiren)?.25+this.random()*.25:.7+this.random()*.8;
        let target = c.lane;
        const safe = lane => {
          const escape=forced&&evacuationSteps.includes(lane);
          if(lane<0||lane>2||(c.truck&&lane===2&&!forced)||(this.signalAt(c.x,lane).mode!=='open'&&!escape))return false;
          if(!escape&&GANTRIES.some((x,g)=>x>c.x&&x-c.x<650&&this.signals[g][lane].mode!=='open'))return false;
          const ahead = this.obstacle(c, lane, this.cars);
          const behind = this.cars.filter(o => o.id !== c.id && (o.lane === lane || (Math.abs(o.visualLane-o.lane)>.02&&o.fromLane===lane)) && o.x < c.x)
            .sort((a, b) => b.x - a.x)[0];
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
          // Return left unless actively passing a slower vehicle there.
          const left = c.lane - 1;
          if (!c.emergency && left >= 0 && safe(left)) {
            const gap = this.obstacle(c, left, snapshot);
            if (gap.gap > Math.max(65, c.v * 3.5) || gap.speed >= Math.min(c.desired, sig.speed * .44704) - 1) target = left;
          }
          const catching = front.gap < Math.max(75, c.v * 3.8) && front.speed < Math.min(c.desired, this.speedTarget(c)) - 2;
          if(c.emergency&&target===c.lane&&catching){
            const options=[c.lane-1,c.lane+1].filter(safe).sort((a,b)=>this.obstacle(c,b).gap-this.obstacle(c,a).gap);
            if(options.length)target=options[0];
          }
          if (target === c.lane && catching && safe(c.lane + 1)) {
            const right = this.obstacle(c, c.lane + 1, snapshot);
            if (right.gap > front.gap + 20 || right.speed > front.speed + 2) target = c.lane + 1;
          }
        }
        if (target !== c.lane) { c.fromLane = c.lane; c.lane = target; c.cooldown = 5 + this.random() * 4; }
      }
    }
    const movementSnapshot=this.cars.map(c=>({...c}));
    for(const c of this.cars){
      if(c.recovering!=null){c.v=0;continue;}
      if(c.lane<0){
        const front=this.obstacle(c,c.lane,movementSnapshot);
        c.v=Math.min(c.desired,c.v+c.acceleration*dt);
        const berth=this.incidents.find(i=>i.id===c.recoveryTarget);
        const remaining=berth?Math.max(0,berth.x-25-c.x):Infinity;
        c.x+=Math.min(remaining,Math.max(0,front.gap-2),c.v*dt);continue;
      }
      let front=this.obstacle(c,c.lane,movementSnapshot);

      if (Math.abs(c.visualLane - c.lane) > .02) {
        const oldFront = this.obstacle(c, c.fromLane, movementSnapshot);
        if (oldFront.gap < front.gap) front = oldFront;
      }
      const unruly = this.scenario === 'reckless' && c.reckless;
      const limit = this.speedTarget(c);
      let desired = Math.max(3, Math.min(c.desired * (rain ? .82 : 1), limit * c.courtesy * (unruly ? 1.15 : 1)));
      const yielding=movementSnapshot.some(o=>{
        if(o.lane<0||o.id===c.id||Math.abs(o.lane-c.lane)!==1||o.x<c.x+5||o.x>c.x+120)return false;
        const current=this.signalAt(o.x,o.lane);
        const next=GANTRIES.findIndex((x,g)=>x>o.x&&x-o.x<350&&this.signals[g][o.lane].mode!=='open');
        const warning=next>=0?this.signals[next][o.lane]:current;
        if(warning.mode==='open')return false;
        const target=warning.mode.startsWith('merge')?this.mergeTarget(warning.mode,o.lane):(o.lane<c.lane?o.lane+1:o.lane-1);
        return target===c.lane&&this.signalAt(c.x,c.lane).mode==='open';
      });
      if(yielding&&!c.emergency)desired=Math.min(desired,Math.max(4,c.v-1.2));
      const headway = c.headway * (rain ? 1.35 : unruly ? .65 : 1);
      const closing = c.v - front.speed;
      const wanted = 3.5 + Math.max(0, c.v * headway + c.v * closing / (2 * Math.sqrt(c.acceleration * 2)));
      let acceleration = c.acceleration * (1 - (c.v / desired) ** 4 - (wanted / front.gap) ** 2);
      // Each stopped driver waits their own reaction time as the queue releases.
      if (c.v < .4 && (front.gap < 8 || front.speed < .5 && front.gap < 20)) c.restart = c.reaction;
      else c.restart = Math.max(0, c.restart - dt);
      if (c.restart > 0 && c.v < .4) acceleration = Math.min(0, acceleration);
      const targetA = clamp(acceleration, -6, c.acceleration);
      c.a += (targetA - c.a) * Math.min(1, dt / (targetA < -2 ? .18 : c.reaction));
      const nextV = Math.max(0, c.v + c.a * dt);
      const requested = Math.max(0, (c.v + nextV) * .5 * dt);
      const move = Math.min(Math.max(0, front.gap - 2), requested);
      c.x += move; c.v = move < requested ? move / dt : nextV;
      c.braking = c.a < -.6;
      c.visualLane += (c.lane - c.visualLane) * Math.min(1, dt * .85);
    }
    this.enforceSeparation();
    this.cars = this.cars.filter(c => {
      if (c.x > LENGTH) { this.exits.push(this.elapsed); return false; } return true;
    });
    this.exits = this.exits.filter(t => t > this.elapsed - 60);
  }
}
