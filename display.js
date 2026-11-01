// Every icon stays on its actual lane centre (or the shared slip-road curve).
// Overview artwork is compact and fixed-size; spacing belongs to the road projection.
export function layoutSprites(cars,incidents,{left,laneWidth,project,laneX,angleAt,rampPosition,overview=false}){
 const sprites=[];
 function append(c,staticBody=false){
  const designWidth=c.kind==='ambulance'?7:c.kind==='recovery'||c.truck?8:5;
  const designHeight=c.towing||c.kind==='recovery'?20:c.truck?13:c.kind==='ambulance'?10:6;
  const width=overview?(c.kind==='ambulance'?3:c.kind==='recovery'||c.truck?3.5:c.emergency||c.blocker?3:2.5):designWidth;
  const height=overview?(c.towing||c.kind==='recovery'?7:c.truck?6:c.kind==='ambulance'?4.5:c.emergency||c.blocker?4:3):designHeight;
  const slip=(c.onRamp!=null||c.slipRamp!=null)&&rampPosition?rampPosition(c):null;
  const cx=slip?slip.x:(laneX?laneX(c.x,c.lane<0?-1:c.visualLane):c.lane<0?left-10:left+(c.visualLane+.5)*laneWidth);
  const heading=slip?.angle??(angleAt?angleAt(c.x):0);
  const baseHeading=overview?Math.max(-.02,Math.min(.02,heading)):heading;
  // Lane velocity comes from the model's eased manoeuvre, never from the
  // schematic spacing offsets. Turn into the curve, then unwind as it settles.
  const changing=!staticBody&&c.lane>=0&&c.onRamp==null&&c.slipRamp==null;
  const yawLimit=overview?(c.truck?.16:.22):.30;
  const steering=changing?yawLimit*Math.tanh((c.laneChangeRate??0)*4):0;
  const sprite={...c,static:staticBody,cx,cy:slip?slip.y:project(c.x),width,height,nominalHeight:height,designWidth,designHeight,angle:baseHeading+steering,visible:true,packedOffset:0};
  sprites.push(sprite);
 }
 for(const c of cars)append(c);
 for(const i of incidents){
  const bodies=i.bodies??[{lane:i.lane,x:i.x,length:i.length,truck:i.truck,vehicleId:i.vehicleId}];
  for(let n=0;n<bodies.length;n++)append({...i,...bodies[n],bodyIndex:n,visualLane:bodies[n].lane},true);
 }
 return sprites.sort((a,b)=>a.cy-b.cy||Number(b.static)-Number(a.static)||a.id-b.id);
}
export function createSpriteLayout(){return layoutSprites;}
