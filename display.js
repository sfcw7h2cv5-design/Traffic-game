// Keep the map tied to physical positions. Symbols scale down only when traffic
// is closely packed, rather than moving neighbours or delaying a visible merge.
export function layoutSprites(cars, incidents, {left,laneWidth,project}) {
 const sprites=[...cars.map(c=>({...c,static:false})),...incidents.map(i=>({...i,visualLane:i.lane,static:true}))].map(c=>{
  const width=c.kind==='ambulance'?7:c.kind==='recovery'||c.truck?8:5;
  const nominalHeight=c.towing||c.kind==='recovery'?20:c.truck?13:c.kind==='ambulance'?10:6;
  return {...c,cx:c.lane<0?left-10:left+(c.visualLane+.5)*laneWidth,cy:project(c.x),width,nominalHeight,height:nominalHeight};
 }).sort((a,b)=>a.cy-b.cy);
 for(let i=0;i<sprites.length;i++){
  const c=sprites[i];
  for(let j=i+1;j<sprites.length;j++){
   const behind=sprites[j];
   if(Math.abs(c.cx-behind.cx)<(c.width+behind.width)/2+3){
    c.height=Math.min(c.height,Math.max(0,(behind.cy-c.cy)*.75));
   }
  }
 }
 return sprites;
}
export function createSpriteLayout(){return layoutSprites;}
