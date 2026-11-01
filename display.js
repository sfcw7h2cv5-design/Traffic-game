// Never cull individual vehicles or resize them according to nearby traffic.
// Overview lengths use one uniform metres-to-pixels scale for the whole road;
// Detail uses larger fixed symbols. Thus every vehicle stays visible in queues.
export function layoutSprites(cars, incidents, {left,laneWidth,project,overview=false,laneX,angleAt}) {
 const scale=Math.abs(project(1)-project(0));
 return [...cars.map(c=>({...c,static:false})),...incidents.flatMap(i=>(i.bodies??[{lane:i.lane,x:i.x,length:i.length,truck:i.truck,vehicleId:i.vehicleId}]).map((body,n)=>({...i,...body,bodyIndex:n,visualLane:body.lane,static:true})))].map(c=>{
  const width=c.kind==='ambulance'?7:c.kind==='recovery'||c.truck?8:5;
  const designHeight=c.towing||c.kind==='recovery'?20:c.truck?13:c.kind==='ambulance'?10:6;
  const length=c.length??(c.kind==='recovery'?16:c.truck?16.5:c.kind==='ambulance'?7:4.7);
  const height=overview?length*scale:designHeight;
  return {...c,cx:laneX?laneX(c.x,c.lane<0?-1:c.visualLane):c.lane<0?left-10:left+(c.visualLane+.5)*laneWidth,cy:project(c.x),width,height,nominalHeight:height,designHeight,angle:angleAt?(overview?Math.max(-.02,Math.min(.02,angleAt(c.x))):angleAt(c.x)):0,visible:true};
 }).sort((a,b)=>a.cy-b.cy);
}
export function createSpriteLayout(){return layoutSprites;}
