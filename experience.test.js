import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,GANTRIES} from './model.js';
import {environmentAt,driverProfile} from './experience.js';
function setup(){const s=new Simulation(()=>.5);s.cars=[];s.incidents=[];s.waiting=0;s.nextArrival=s.nextIncident=s.nextEmergency=Infinity;const n=s.systems;n.work.startsAt=n.work.announceAt=n.roadblock.startsAt=n.phase.endsAt=Infinity;for(const r of n.ramps)r.nextArrival=Infinity;return s;}
test('day, twilight and night cycle automatically, with continuous rain and fog',()=>{
 assert.equal(environmentAt(0).light,'Daylight');assert.equal(environmentAt(600).light,'Twilight');assert.equal(environmentAt(750).light,'Night');assert.equal(environmentAt(1200).light,'Daylight');
 assert(environmentAt(240).wetness>.9);assert(environmentAt(720).fog>.9);
 for(let t=0;t<2400;t++)for(const k of ['darkness','wetness','fog']){const a=environmentAt(t)[k],b=environmentAt(t+.1)[k];assert(a>=0&&a<=1);assert(Math.abs(a-b)<.01,k+' changed abruptly');}
});
test('automatic shifts begin without selection and retain their completed report',()=>{
 const s=setup(),n=s.systems,e=n.experience;assert.equal(e.shift.name,'Morning commute');
 for(let i=0;i<25;i++)n.recordExit({});e.shift.delay=120;e.shift.hardBrakes=4;
 n.phase.endsAt=0;s.step(.1);assert.equal(e.completedShifts,1);assert.equal(e.lastReport.exits,25);assert.equal(e.lastReport.hardBrakes,4);assert(e.lastReport.score>=0&&e.lastReport.score<=100);
 assert.equal(e.shift.name,'Rush-hour squeeze');assert.equal(e.shift.exits,0);assert.equal(e.shift.startsAt,s.elapsed);
});
test('shift braking events are counted once and remain counted after the rolling minute',()=>{
 const s=setup(),e=s.systems.experience;s.elapsed=1;s.hardBrakeEvents=[1,1];e.afterStep(.1);e.afterStep(.1);assert.equal(e.shift.hardBrakes,2);
 s.elapsed=62;s.hardBrakeEvents=[];e.afterStep(.1);assert.equal(e.shift.hardBrakes,2);
});
test('warning boards detect queues and incidents upstream and clear when trouble passes',()=>{
 const s=setup(),e=s.systems.experience,g=GANTRIES[2];s.incidents=[{id:1,lane:0,x:g+700,length:5}];e.updateWarnings();assert.equal(e.warnings[2].kind,'incident');
 for(let i=0;i<3;i++)s.spawn(1,g+300+i*30,0);e.updateWarnings();assert.equal(e.warnings[2].kind,'queue');
 s.cars=[];s.incidents=[];e.updateWarnings();assert.equal(e.warnings[2],null);
 s.systems.ramps[1].mode='closed';e.updateWarnings();assert.equal(e.warnings[4].text,'J2 ENTRY CLOSED');
 assert(e.setWarning(2,'fog'));assert.equal(e.warnings[2].text,'FOG · SLOW DOWN');assert(e.setWarning(2,'clear'));assert.equal(e.warnings[2],null);assert(!e.setWarning(2,'invalid'));
});
test('warning response slows moving traffic gradually without closing or stopping a lane',()=>{
 const speeds=[];for(const mode of ['clear','queue']){const s=setup(),e=s.systems.experience;e.setWarning(2,mode);const c=s.spawn(1,GANTRIES[2]+100,25);Object.assign(c,{truck:false,length:4.7,desired:30,courtesy:1,headway:2,reaction:1,acceleration:1.3,cooldown:Infinity,decision:Infinity});
 for(let i=0;i<100;i++){const x=c.x;s.step(.1);assert(c.x>x);assert(c.v>10);assert.equal(s.signals[2][1].mode,'open');}speeds.push(c.v);}
 assert(speeds[1]<speeds[0]-2);
});
test('weather changes driving speed while preserving forward motion and physical separation',()=>{
 const speeds=[];for(const time of [0,240,720]){const s=setup();s.elapsed=time;const c=s.spawn(1,3000,25);Object.assign(c,{truck:false,length:4.7,desired:30,courtesy:1,headway:2,reaction:1,acceleration:1.3,cooldown:Infinity,decision:Infinity});
 const rear=s.spawn(1,2900,25);Object.assign(rear,{truck:false,length:4.7,desired:30,courtesy:1,cooldown:Infinity,decision:Infinity});for(let i=0;i<150;i++){const x=c.x;s.step(.1);assert(c.x>x);assert(c.x-c.length-rear.x>=1.99);}speeds.push(c.v);}
 assert(speeds[1]<speeds[0]-2);assert(speeds[2]<speeds[0]-2);
});
test('driver styles have coherent pace, gap and acceleration differences, with emergency traffic exempt',()=>{
 const cautious=driverProfile(0,false),commuter=driverProfile(2,false);assert(cautious.pace<commuter.pace);assert(cautious.gap>commuter.gap);assert(cautious.power<commuter.power);
 const s=setup();s.id=0;const c=s.spawn(0,0,0);assert(c.driverStyle);const emergency=s.spawn(2,300,30,'police');assert.equal(emergency.driverStyle,undefined);assert.equal(emergency.desired,110*.44704);
 assert.equal(driverProfile(0,true).name,'Loaded HGV');
});
