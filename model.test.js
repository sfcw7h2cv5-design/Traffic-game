import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from './model.js';
function seeded(seed = 42) { let n = seed; return () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296); }
function quiet(s) { s.nextIncident = Infinity; s.nextArrival = Infinity; s.waiting = 0; }
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
 for (const c of cars) { c.cooldown = 100; c.reaction = 1; }
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
