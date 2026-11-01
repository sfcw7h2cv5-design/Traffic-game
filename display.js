// The overview deliberately enlarges vehicle symbols. Physical coordinates stay
// in the traffic model; queue symbols spread upstream to remain distinguishable.
export function layoutSprites(cars, incidents, {left, laneWidth, project}) {
 const source=[...cars.map(c=>({...c,static:false})),...incidents.map(i=>({...i,visualLane:i.lane,static:true}))].sort((a,b)=>b.x-a.x);
 const placed=[];
 for(const c of source){
  const cx=c.lane<0?left-10:left+(c.visualLane+.5)*laneWidth;
  const width=c.kind==='ambulance'?7:c.kind==='recovery'||c.truck?8:5;
  const height=c.towing||c.kind==='recovery'?20:c.truck?13:c.kind==='ambulance'?10:6;
  let cy=project(c.x);
  for(const p of placed)if(Math.abs(cx-p.cx)<(width+p.width)/2+3)cy=Math.max(cy,p.cy+p.height+2);
  placed.push({...c,cx,cy,width,height});
 }
 return placed;
}

// Keep a stable presentation across frames. Inserting a merging vehicle must
// never re-pack existing cars backwards; its lateral movement waits for space.
export function createSpriteLayout(){
 let previous=new Map(),geometry='';
 const key=c=>c.static&&c.vehicleId==null?'incident:'+c.id:'car:'+(c.static?c.vehicleId:c.id);
 return (cars,incidents,options)=>{
  const signature=[options.left,options.laneWidth,options.project(0),options.project(6000)].join(',');
  const desired=layoutSprites(cars,incidents,options);
  if(signature!==geometry){geometry=signature;previous=new Map(desired.map(c=>[key(c),c]));return desired;}
  const alive=new Set(desired.map(key)),placed=[],next=new Map();
  desired.sort((a,b)=>{
   const pa=previous.get(key(a)),pb=previous.get(key(b));
   if(pa&&pb)return pa.cy-pb.cy;
   return pa?-1:pb?1:a.cy-b.cy;
  });
  const intersect=(cx,width,p)=>Math.abs(cx-p.cx)<(width+p.width)/2+3;
  for(const c of desired){
   const prior=previous.get(key(c));let cx=c.cx,cy=c.cy;
   if(prior){
    const maxAdvance=Math.max(1,Math.abs(c.x-prior.x)*Math.abs(options.project(1)-options.project(0))*2);
    cy=Math.max(prior.cy-maxAdvance,Math.min(prior.cy,cy));
    if(Math.abs(cx-prior.cx)>.01){
     const sweptLeft=Math.min(cx,prior.cx)-c.width/2-3,sweptRight=Math.max(cx,prior.cx)+c.width/2+3;
     for(const [id,old]of previous){
      if(id===key(c)||!alive.has(id))continue;
      const p=next.get(id)??old;
      if(sweptLeft<p.cx+p.width/2&&sweptRight>p.cx-p.width/2&&cy<p.cy+p.height+2&&cy+c.height+2>p.cy){cx=prior.cx;break;}
     }
    }
    const fit=x=>placed.reduce((y,p)=>intersect(x,c.width,p)?Math.max(y,p.cy+p.height+2):y,cy);
    let fitted=fit(cx);
    if(fitted>prior.cy+1e-8){cx=prior.cx;fitted=fit(cx);}
    cy=Math.min(prior.cy,fitted);
   }else{
    let changed=true;
    while(changed){changed=false;for(const p of placed)if(intersect(cx,c.width,p)&&cy<p.cy+p.height+2&&cy+c.height+2>p.cy){cy=p.cy+p.height+2;changed=true;}}
   }
   const sprite={...c,cx,cy};placed.push(sprite);next.set(key(c),sprite);
  }
  previous=next;return placed;
 };
}
