// The overview deliberately enlarges vehicle symbols. Physical coordinates stay
// in the traffic model; queue symbols spread upstream to remain distinguishable.
export function layoutSprites(cars, incidents, {left, laneWidth, project}) {
 const source=[...cars.map(c=>({...c,static:false})),...incidents.map(i=>({...i,visualLane:i.lane,static:true}))].sort((a,b)=>b.x-a.x);
 const placed=[];
 for(const c of source){
  const cx=c.lane<0?left-10:left+(c.visualLane+.5)*laneWidth;
  const width=c.kind==='ambulance'?7:c.kind==='recovery'||c.truck?8:5;
  const height=c.towing?20:c.kind==='recovery'||c.truck?13:c.kind==='ambulance'?10:6;
  let cy=project(c.x);
  for(const p of placed)if(Math.abs(cx-p.cx)<(width+p.width)/2+3)cy=Math.max(cy,p.cy+p.height+2);
  placed.push({...c,cx,cy,width,height});
 }
 return placed;
}
