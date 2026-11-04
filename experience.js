// Deterministic shift atmosphere: simulation time only, independent of rendering.
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function environmentAt(elapsed){
 const minutes=(480+elapsed*1.2)%1440,hour=minutes/60;
 const darkness=hour>=19?clamp((hour-19)/2):hour<6?1:hour<8?clamp((8-hour)/2):0;
 const t=elapsed%1200;
 let wetness=0,fog=0;
 if(t>=150&&t<420)wetness=Math.min(clamp((t-150)/60),clamp((420-t)/60));
 if(t>=600&&t<840)fog=Math.min(clamp((t-600)/60),clamp((840-t)/60));
 if(t>=960)wetness=Math.min(clamp((t-960)/60),clamp((1200-t)/60));
 return {minutes,darkness,wetness,fog,light:darkness>.8?'Night':darkness>.05?'Twilight':'Daylight',weather:fog>.1?'Mist & fog':wetness>.65?'Rain':wetness>.05?'Light rain':'Dry'};
}
export function driverProfile(id,truck){
 const n=((id*37+11)%100);
 if(truck)return n<55?{name:'Loaded HGV',pace:.98,gap:1.08,response:1.05,power:.92}:{name:'Cruising HGV',pace:1,gap:1,response:1,power:1};
 if(n<20)return {name:'Cautious',pace:.94,gap:1.12,response:1.08,power:.92};
 if(n<30)return {name:'Unhurried',pace:.90,gap:1.08,response:1.1,power:.88};
 if(n>79)return {name:'Confident commuter',pace:1.02,gap:.94,response:.9,power:1.04};
 return {name:'Steady',pace:1,gap:1,response:1,power:1};
}
export class ShiftExperience{
 constructor(sim,network){
  this.sim=sim;this.network=network;this.enabled=true;this.environment=environmentAt(0);
  this.warningModes=network.gantries.map(()=> 'auto');this.warnings=network.gantries.map(()=>null);this.nextWarnings=0;this.lastReport=null;this.completedShifts=0;this.lastBrakeTime=sim.elapsed;
  this.startShift();
 }
 startShift(){
  const n=this.network,s=this.sim,night=environmentAt(s.elapsed).darkness>.8,names=[night?'Night shift':'Morning commute',night?'Late traffic surge':'Rush-hour squeeze','Clear the tailbacks','Stadium departure','Keep the network moving'];
  this.shift={name:names[n.phaseIndex%names.length],startsAt:s.elapsed,endsAt:n.phase.endsAt,target:Math.max(15,Math.round(n.phase.duration/60*15*n.phase.multiplier)),exits:0,delay:0,hardBrakes:0};
 }
 finishShift(){
  const s=this.shift;this.lastReport={...s,score:Math.round(Math.min(70,s.exits/s.target*70)+Math.max(0,15-s.hardBrakes*.3)+Math.max(0,15-s.delay/120))};this.completedShifts++;
 }
 setWarning(index,mode){
  if(!this.network.gantries[index]||!['auto','clear','queue','incident','slippery','fog','junction'].includes(mode))return false;
  this.warningModes[index]=mode;this.nextWarnings=0;this.updateWarnings();return true;
 }
 updateWarnings(){
  const s=this.sim,n=this.network,e=this.environment;
  this.warnings=n.gantries.map((g,i)=>{
   const mode=this.warningModes[i];if(mode==='clear')return null;
   const incident=s.incidents.filter(a=>a.x>g&&a.x-g<2500).sort((a,b)=>a.x-b.x)[0];
   const queued=s.cars.filter(c=>c.lane>=0&&c.onRamp==null&&c.offRamp==null&&c.v<5&&c.x>g&&c.x-g<1800);
   const queue=queued.length>=3?queued.reduce((a,b)=>a.x<b.x?a:b):null;
   const junction=n.ramps.find(r=>r.mode==='closed'&&r.x>g&&r.x-g<4000);
   const kind=mode!=='auto'?mode:queue?'queue':incident?'incident':junction?'junction':e.fog>.1?'fog':e.wetness>.2?'slippery':null;
   if(!kind)return null;
   const text={queue:'QUEUE AHEAD',incident:'INCIDENT AHEAD',junction:junction?junction.name+' ENTRY CLOSED':'ENTRY CLOSED',fog:'FOG · SLOW DOWN',slippery:'WET ROAD'}[kind];
   return {kind,text,speed:kind==='junction'?60:kind==='slippery'?60:50,hazardX:mode==='auto'?(kind==='queue'?queue?.x:kind==='incident'?incident?.x:kind==='junction'?junction?.x:null):null};
  });this.nextWarnings=s.elapsed+2;
 }
 beforeStep(){
  if(!this.enabled)return;
  this.environment=environmentAt(this.sim.elapsed);
  if(this.sim.elapsed>=this.nextWarnings)this.updateWarnings();
 }
 warningSpeed(car){
  if(!this.enabled||car.emergency||car.onRamp!=null||car.offRamp!=null)return Infinity;
  let speed=Infinity;
  for(let i=0;i<this.warnings.length;i++){
   const w=this.warnings[i],g=this.network.gantries[i];
   if(!w||car.x<g-350||car.x>g+1200||w.hazardX!=null&&car.x>w.hazardX)continue;
   speed=Math.min(speed,Math.sqrt((w.speed*.44704)**2+2*1.2*Math.max(0,g-car.x)));
  }return speed;
 }
 afterStep(dt){
  if(!this.enabled)return;
  const s=this.sim;
  for(const c of s.cars)if(!c.emergency&&c.lane>=0&&c.onRamp==null&&c.offRamp==null){
   const free=Math.max(1,Math.min(c.desired,s.signalAt(c.x,c.lane).speed*.44704));this.shift.delay+=Math.max(0,1-c.v/free)*dt;
  }
  this.shift.delay+=(s.waiting+this.network.ramps.reduce((a,r)=>a+r.queue.length,0))*dt;
  // Count events as they happen: the model's rolling-minute list later expires.
  const recent=s.hardBrakeEvents.filter(t=>t>this.lastBrakeTime).length;this.shift.hardBrakes+=recent;this.lastBrakeTime=s.elapsed;
 }
 recordExit(){if(this.enabled)this.shift.exits++;}
}
