// One longitudinal projection keeps icons, gantries, incidents and road geometry
// aligned. Congested intervals gain room; unused road intervals compress.
function defaultIconHeight(c){
 return c.towing||c.kind==='recovery'?7:c.truck?6:c.kind==='ambulance'?4.5:c.emergency||c.blocker?4:3;
}
function lowerBound(values,value){
 let low=0,high=values.length;
 while(low<high){const mid=(low+high)>>>1;if(values[mid]<value)low=mid+1;else high=mid;}
 return low;
}
export function createNetworkProjection(cars,incidents,{length=10000,height=940,iconHeight=defaultIconHeight,gap=.6,ramps=[],gantries=[],minGantrySpacing=45,minScale=.008,occupiedLanes}={}){
 const records=[],seen=new Set();
 function addCar(c,rampId=null){
  const key=c.id==null?c:c.id;if(seen.has(key))return;seen.add(key);
  const joining=c.onRamp!=null,slip=rampId??c.slipRamp;
  let groups;
  if(slip!=null&&!joining)groups=['ramp:'+slip];
  else{
   const lanes=occupiedLanes?occupiedLanes(c):Math.abs((c.visualLane??c.lane)-c.lane)>.2&&c.fromLane!=null?[c.lane,c.fromLane]:[c.lane];
   groups=[...new Set(lanes)].map(l=>'lane:'+l);
   if(joining)groups.push('ramp:'+c.onRamp);
  }
  records.push({x:c.x,extent:Math.max(0,iconHeight(c,false))+gap,groups,source:key});
 }
 for(const c of cars)addCar(c);
 for(const r of ramps)for(const c of r.queue??[])addCar(c,r.id);
 // Keep a visible acceleration lane even when empty motorway is compressed.
 for(const r of ramps){
  const group=['join-geometry:'+r.id],merge=r.mergeLength??600,approach=r.approachLength??1100;
  records.push({x:r.x-approach,extent:0,groups:group,source:'ramp-start:'+r.id});
  records.push({x:r.x-merge,extent:40,groups:group,source:'ramp-entry:'+r.id});
  records.push({x:r.x,extent:80,groups:group,source:'ramp-join:'+r.id});
 }
 for(const incident of incidents){
  if(incident.type==='roadworks'||incident.type==='police-clearance')continue;
  const bodies=incident.bodies??[incident];
  for(let n=0;n<bodies.length;n++){
   const c={...incident,...bodies[n],static:true};
   records.push({x:c.x,extent:Math.max(0,iconHeight(c,true))+gap,groups:['lane:'+c.lane],source:'incident:'+incident.id+':'+n});
  }
 }
 for(const x of gantries)records.push({x,extent:minGantrySpacing,groups:['gantries'],source:'gantry:'+x});
 if(gantries.length)for(const x of [0,length])records.push({x,extent:minGantrySpacing,groups:['gantries'],source:'boundary:'+x});
 // Out-of-network arrivals/exits are extrapolated through the boundary. They
 // must not consume extra space or move the network while still off screen.
 const visible=records.filter(r=>Number.isFinite(r.x)&&r.x>=0&&r.x<=length);
 const world=[...new Set([0,length,...visible.map(r=>r.x)])].sort((a,b)=>a-b);
 const byWorld=new Map(world.map((x,i)=>[x,i])),edges=world.map(()=>[]),lastByGroup=new Map(),conflicts=[];
 visible.sort((a,b)=>a.x-b.x);
 for(const r of visible){
  const to=byWorld.get(r.x);
  for(const group of r.groups){
   const from=lastByGroup.get(group);
   if(from!=null){
    if(from===to)conflicts.push({group,x:r.x,source:r.source});
    else edges[to].push({from,distance:r.extent});
   }
   lastByGroup.set(group,to);
  }
 }
 const work=new Float64Array(world.length);
 function solve(baseScale){
  work[0]=0;
  for(let i=1;i<world.length;i++){
   let value=work[i-1]+(world[i]-world[i-1])*baseScale;
   const incoming=edges[i];
   for(let j=0;j<incoming.length;j++){const edge=incoming[j];value=Math.max(value,work[edge.from]+edge.distance);}
   work[i]=value;
  }
  return work;
 }
 const baseline=Math.max(1e-7,minScale),minimum=solve(baseline);
 const requiredHeight=Math.max(height,Math.ceil(minimum[minimum.length-1]-48));
 const available=requiredHeight+48;
 let low=Math.min(baseline,available/length),high=available/length;
 // Twelve short DAG passes find a feasible scale to about 1/4096 precision;
 // positive uniform residue below preserves every exact spacing constraint.
 for(let i=0;i<12;i++){const mid=(low+high)/2,d=solve(mid);if(d[d.length-1]<=available)low=mid;else high=mid;}
 const distance=solve(low),used=distance[distance.length-1];
 // Numerical residue is added uniformly, preserving every spacing constraint.
 const extra=Math.max(0,available-used);
 for(let i=0;i<distance.length;i++)distance[i]+=extra*world[i]/length;
 function section(x){return Math.max(1,Math.min(world.length-1,lowerBound(world,x)));}
 function forward(x){
  const i=section(x),fraction=(x-world[i-1])/(world[i]-world[i-1]);
  return distance[i-1]+fraction*(distance[i]-distance[i-1]);
 }
 function project(x){return requiredHeight+24-forward(x);}
 function unproject(y){
  const value=requiredHeight+24-y,i=Math.max(1,Math.min(distance.length-1,lowerBound(distance,value)));
  return world[i-1]+(value-distance[i-1])*(world[i]-world[i-1])/(distance[i]-distance[i-1]);
 }
 function scaleAt(x){const i=section(x);return (distance[i]-distance[i-1])/(world[i]-world[i-1]);}
 // Full precision prevents stale road caches from hiding small mapping changes.
 const key=requiredHeight+':'+world.map((x,i)=>x+','+distance[i]).join(';');
 return {project,unproject,scaleAt,scale:available/length,requiredHeight,key,conflicts,
  knots:world.map((x,i)=>({x,y:requiredHeight+24-distance[i]}))};
}
