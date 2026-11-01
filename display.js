// Every icon stays on its actual lane centre (or the shared slip-road curve).
// The full network uses bright, wider glyphs at one fixed road scale. Their size
// never depends on nearby traffic; Detail keeps the larger vehicle artwork.
export function layoutSprites(cars,incidents,{left,laneWidth,project,laneX,angleAt,rampPosition,overview=false}){
 const sprites=[],roadScale=Math.abs(project(1)-project(0));
 function append(c,staticBody=false){
  const designWidth=c.kind==='ambulance'?7:c.kind==='recovery'||c.truck?8:5;
  const designHeight=c.towing||c.kind==='recovery'?20:c.truck?13:c.kind==='ambulance'?10:6;
  const width=overview?(c.kind==='recovery'||c.truck?3.2:c.kind==='ambulance'||c.kind==='police'||c.kind==='roadblock'||c.emergency||c.blocker?2.8:2.6):designWidth;
  const physicalLength=c.length??(c.kind==='recovery'?11:c.kind==='ambulance'?7:c.truck?16.5:4.7);
  const compactHeight=c.towing||c.kind==='recovery'?7:c.truck?6:c.kind==='ambulance'?4.5:c.emergency||c.blocker?4:3;
  const height=overview?Math.min(compactHeight,physicalLength*roadScale*.90):designHeight;
  const slip=(c.onRamp!=null||c.slipRamp!=null)&&rampPosition?rampPosition(c):null;
  const shoulderRejoin=c.lane>=0&&c.fromLane<0&&c.visualLane<0;
  const roadX=laneX?laneX(c.x,c.lane<0?-1:c.visualLane):c.lane<0?left-10:left+(c.visualLane+.5)*laneWidth;
  const shoulderX=shoulderRejoin?(laneX?laneX(c.x,-1):left-10):0;
  const runningX=shoulderRejoin?(laneX?laneX(c.x,0):left+laneWidth/2):0;
  const cx=slip?slip.x:shoulderRejoin?shoulderX+(runningX-shoulderX)*(c.visualLane+1):roadX;
  const heading=slip?.angle??(angleAt?angleAt(c.x):0);
  const baseHeading=overview?Math.max(-.02,Math.min(.02,heading)):heading;
  // Lane velocity comes from the model's eased manoeuvre, never from the
  // schematic spacing offsets. Turn into the curve, then unwind as it settles.
  const changing=!staticBody&&c.lane>=0&&c.onRamp==null&&c.slipRamp==null;
  const yawLimit=overview?.025:.30;
  const steering=changing?yawLimit*Math.tanh((c.laneChangeRate??0)*4):0;
  const sprite={...c,static:staticBody,cx,cy:slip?slip.y:project(c.x),width,height,nominalHeight:height,designWidth,designHeight,angle:overview?Math.max(-.025,Math.min(.025,baseHeading+steering)):baseHeading+steering,visible:true,packedOffset:0};
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
