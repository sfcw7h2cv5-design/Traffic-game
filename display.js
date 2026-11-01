// Vehicle dimensions are fixed by type. The close-up road camera supplies
// enough pixels per metre for physical bumper gaps to remain visible.
export function layoutSprites(cars, incidents, {left,laneWidth,project}) {
 return [...cars.map(c=>({...c,static:false})),...incidents.map(i=>({...i,visualLane:i.lane,static:true}))].map(c=>{
  const width=c.kind==='ambulance'?7:c.kind==='recovery'||c.truck?8:5;
  const height=c.towing||c.kind==='recovery'?20:c.truck?13:c.kind==='ambulance'?10:6;
  return {...c,cx:c.lane<0?left-10:left+(c.visualLane+.5)*laneWidth,cy:project(c.x),width,height,nominalHeight:height};
 }).sort((a,b)=>a.cy-b.cy);
}
export function createSpriteLayout(){return layoutSprites;}
