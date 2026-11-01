// Vehicle dimensions are fixed by type. The close-up road camera supplies
// enough pixels per metre for physical bumper gaps to remain visible.
export function layoutSprites(cars, incidents, {left,laneWidth,project,overview=false}) {
 const sprites=[...cars.map(c=>({...c,static:false})),...incidents.map(i=>({...i,visualLane:i.lane,static:true}))].map(c=>{
  const width=c.kind==='ambulance'?7:c.kind==='recovery'||c.truck?8:5;
  const height=c.towing||c.kind==='recovery'?20:c.truck?13:c.kind==='ambulance'?10:6;
  return {...c,cx:c.lane<0?left-10:left+(c.visualLane+.5)*laneWidth,cy:project(c.x),width,height,nominalHeight:height};
 }).sort((a,b)=>a.cy-b.cy);
 if(!overview)return sprites.map(c=>({...c,visible:true}));
 const occupied=[];
 const priority=c=>c.static?0:c.emergency?1:c.kind==='recovery'?2:c.truck?3:4;
 for(const c of [...sprites].sort((a,b)=>priority(a)-priority(b)||a.cy-b.cy)){
  c.visible=!occupied.some(p=>Math.abs(c.cx-p.cx)<(c.width+p.width)/2+3&&c.cy<p.cy+p.height+2&&p.cy<c.cy+c.height+2);
  if(c.visible)occupied.push(c);
 }
 return sprites;
}
export function createSpriteLayout(){return layoutSprites;}

// Queue bands aggregate close, slow vehicles in the wide overview. The traffic
// model still advances every individual vehicle, whether its symbol fits or not.
export function queueBands(cars){
 const result=[];
 for(let lane=0;lane<3;lane++){
  const slow=cars.filter(c=>c.lane===lane&&c.v<8).sort((a,b)=>a.x-b.x);let group=[];
  const flush=()=>{if(group.length>=3)result.push({lane,back:group[0].x-group[0].length,front:group.at(-1).x,count:group.length,speed:group.reduce((n,c)=>n+c.v,0)/group.length});group=[];};
  for(const c of slow){if(group.length&&c.x-group.at(-1).x>120)flush();group.push(c);}flush();
 }
 return result;
}
