export const LENGTH = 3600;
export const GANTRIES = [450, 1650, 2850];
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
    // Stagger each lane independently; most traffic starts in the running lane.
    for (let lane = 0; lane < 3; lane++) {
      for (let x = 100 + random() * 120; x < LENGTH; x += [155, 330, 780][lane] + random() * 140) {
        this.spawn(lane, x, [25, 28, 30][lane] + random() * 2);
      }
    }
  }
  spawn(lane, x = 0, v = 0) {
    const truck = lane < 2 && this.random() < (lane === 0 ? .26 : .10);
    const car = {
      id: this.id++, lane, fromLane: lane, visualLane: lane, x, v,
      length: truck ? 16.5 : 4.7, truck,
      desired: truck ? 23 + this.random() * 2 : 27 + this.random() * 6,
      headway: 1.8 + this.random() * .9,
      reaction: .65 + this.random() * .8,
      acceleration: truck ? .55 + this.random() * .25 : .9 + this.random() * .7,
      courtesy: .96 + this.random() * .06,
      reckless: this.random() < .08,
      cooldown: this.random() * 4, decision: this.random(),
      restart: 0, a: 0, braking: false,
    };
    car.v = Math.min(v, car.desired);
    this.cars.push(car);
    return car;
  }
  signalAt(x, lane) {
    let i = -1;
    for (let j = 0; j < 3; j++) if (x >= GANTRIES[j]) i = j;
    return i < 0 ? { speed: 70, mode: 'open' } : this.signals[i][lane];
  }
  obstacle(car, lane, traffic = this.cars) {
    let pos = LENGTH + 1000, speed = car.desired;
    for (const c of traffic) {
      const occupying = c.lane === lane || (Math.abs(c.visualLane - c.lane) > .08 && c.fromLane === lane);
      if (c.id !== car.id && occupying && c.x >= car.x && c.x - c.length < pos) {
        pos = c.x - c.length; speed = c.v;
      }
    }
    for (const i of this.incidents) if (i.lane === lane && i.x >= car.x && i.x - i.length < pos) {
      pos = i.x - i.length; speed = 0;
    }
    for (let g = 0; g < 3; g++) if (this.signals[g][lane].mode === 'closed' && car.x < GANTRIES[g] && GANTRIES[g] - 8 < pos) {
      pos = Math.max(car.x, GANTRIES[g] - 8); speed = 0;
    }
    return { gap: Math.max(.1, pos - car.x), speed };
  }
  addIncident(lane = 0, x = 2200, type = 'breakdown') {
    if (type === 'breakdown') lane = 0;
    // Use an actual vehicle where possible, preserving its position and appearance.
    const vehicle = this.cars.filter(c => c.lane === lane && c.x > 900 && c.x < 3000 && c.v > 10)
      .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    const incident = { lane, x: vehicle?.x ?? x, type, truck: vehicle?.truck ?? false,
      length: vehicle?.length ?? 4.7, started: this.elapsed };
    if (vehicle) this.cars = this.cars.filter(c => c.id !== vehicle.id);
    this.incidents.push(incident);
    this.lastEvent = `${type === 'breakdown' ? 'Broken-down ' + (incident.truck ? 'HGV' : 'car') : type === 'debris' ? 'Debris reported' : 'Collision reported'} · Lane ${lane + 1} · ${(incident.x / 1000).toFixed(2)} km. Set upstream warnings.`;
    this.eventId++;
    return incident;
  }
  step(dt) {
    this.elapsed += dt;
    if (this.elapsed >= this.nextIncident) {
      if (this.incidents.length < 3) {
        const roll = this.random();
        const type = roll < .65 ? 'breakdown' : roll < .85 ? 'debris' : 'collision';
        this.addIncident(type === 'breakdown' ? 0 : Math.floor(this.random() * 3), 1300 + this.random() * 1500, type);
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
      const front = this.cars.filter(c => c.lane === lane).sort((a, b) => a.x - b.x)[0];
      if (!front || front.x - front.length > Math.max(45, front.v * 2.5)) {
        this.spawn(lane, 0, front ? Math.min(22, front.v) : 23); this.waiting--;
      }
    }
    const rain = this.scenario === 'rain';
    // Freeze all leader positions/speeds for this step. Updating leaders first
    // makes followers react instantly and produces artificial synchronised motion.
    const snapshot = this.cars.map(c => ({ ...c }));
    for (const c of this.cars) {
      c.cooldown -= dt; c.decision -= dt;
      const sig = this.signalAt(c.x, c.lane);
      let front = this.obstacle(c, c.lane, snapshot);
      const upcoming = GANTRIES.findIndex((x, g) => x > c.x && x - c.x < 350 && this.signals[g][c.lane].mode !== 'open');
      const warning = upcoming >= 0 ? this.signals[upcoming][c.lane] : sig;
      const forced = sig.mode !== 'open' || upcoming >= 0 || (front.gap < 160 && front.speed < 3);
      if (c.decision <= 0 && c.cooldown <= 0 && Math.abs(c.visualLane - c.lane) < .08) {
        c.decision = .7 + this.random() * .8;
        let target = c.lane;
        const safe = lane => {
          if (lane < 0 || lane > 2 || (c.truck && lane === 2) || this.signalAt(c.x, lane).mode !== 'open') return false;
          if (upcoming >= 0 && this.signals[upcoming][lane].mode !== 'open') return false;
          const ahead = this.obstacle(c, lane, this.cars);
          const behind = this.cars.filter(o => o.id !== c.id && (o.lane === lane || Math.abs(o.visualLane - lane) < .9) && o.x < c.x)
            .sort((a, b) => b.x - a.x)[0];
          const rearGap = behind ? c.x - c.length - behind.x : 1000;
          const rearNeeded = behind ? 5 + behind.v * 1.5 + Math.max(0, behind.v - c.v) * 3 : 0;
          return ahead.gap > 6 + c.v * (forced ? 1.1 : 1.8) && rearGap > rearNeeded;
        };
        if (forced) {
          const candidates = warning.mode === 'merge' ? [c.lane === 2 ? 1 : c.lane + 1] : [c.lane + 1, c.lane - 1];
          target = candidates.find(safe) ?? c.lane;
        } else {
          // Return left unless actively passing a slower vehicle there.
          const left = c.lane - 1;
          if (left >= 0 && safe(left)) {
            const gap = this.obstacle(c, left, snapshot);
            if (gap.gap > Math.max(65, c.v * 3.5) || gap.speed >= Math.min(c.desired, sig.speed * .44704) - 1) target = left;
          }
          const catching = front.gap < Math.max(75, c.v * 3.8) && front.speed < Math.min(c.desired, sig.speed * .44704) - 2;
          if (target === c.lane && catching && safe(c.lane + 1)) {
            const right = this.obstacle(c, c.lane + 1, snapshot);
            if (right.gap > front.gap + 20 || right.speed > front.speed + 2) target = c.lane + 1;
          }
        }
        if (target !== c.lane) { c.fromLane = c.lane; c.lane = target; c.cooldown = 5 + this.random() * 4; }
      }
      front = this.obstacle(c, c.lane, snapshot);
      if (Math.abs(c.visualLane - c.lane) > .08) {
        const oldFront = this.obstacle(c, c.fromLane, snapshot);
        if (oldFront.gap < front.gap) front = oldFront;
      }
      const unruly = this.scenario === 'reckless' && c.reckless;
      const limit = this.signalAt(c.x, c.lane).speed * .44704;
      const desired = Math.max(3, Math.min(c.desired * (rain ? .82 : 1), limit * c.courtesy * (unruly ? 1.15 : 1)));
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
      const move = Math.min(Math.max(0, front.gap - .8), requested);
      c.x += move; c.v = move < requested ? move / dt : nextV;
      c.braking = c.a < -.6;
      c.visualLane += (c.lane - c.visualLane) * Math.min(1, dt * .85);
    }
    this.cars = this.cars.filter(c => {
      if (c.x > LENGTH) { this.exits.push(this.elapsed); return false; } return true;
    });
    this.exits = this.exits.filter(t => t > this.elapsed - 60);
  }
}
