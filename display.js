// Use the same fixed vehicle icons in overview and detail. Size never depends
// on speed, nearby vehicles or queue density; positions follow the traffic model.
export function layoutSprites(cars, incidents, {left,laneWidth,project,laneX,angleAt,rampPosition}) {
 const sprites=[];
 function append(c,staticBody=false){
  const width=c.kind==='ambulance'?7:c.kind==='recovery'||c.truck?8:5;
  const height=c.towing||c.kind==='recovery'?20:c.truck?13:c.kind==='ambulance'?10:6;
  const slip=(c.onRamp!=null||c.slipRamp!=null)&&rampPosition?rampPosition(c):null;
  const cx=slip?slip.x:(laneX?laneX(c.x,c.lane<0?-1:c.visualLane):c.lane<0?left-10:left+(c.visualLane+.5)*laneWidth);
  sprites.push({...c,static:staticBody,cx,cy:slip?slip.y:project(c.x),width,height,nominalHeight:height,designHeight:height,angle:angleAt?angleAt(c.x):0,visible:true});
 }
 for(const c of cars)append(c);
 for(const i of incidents){
  const bodies=i.bodies??[{lane:i.lane,x:i.x,length:i.length,truck:i.truck,vehicleId:i.vehicleId}];
  for(let n=0;n<bodies.length;n++)append({...i,...bodies[n],bodyIndex:n,visualLane:bodies[n].lane},true);
 }
 return sprites.sort((a,b)=>a.cy-b.cy);
}
export function createSpriteLayout(){return layoutSprites;}
