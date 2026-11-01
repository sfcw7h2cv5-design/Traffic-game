// Overview icons are compact but fixed-size. Packing changes only a small
// lateral offset within the lane; road position, vehicle count and size stay exact.
const SLOT_PITCH=4,ICON_GAP=.16;
function bounds(c,cx=c.cx){
 const cos=Math.cos(c.angle),sin=Math.sin(c.angle);
 const width=Math.abs(cos)*c.width+Math.abs(sin)*c.height;
 const height=Math.abs(sin)*c.width+Math.abs(cos)*c.height;
 const x=cx-sin*c.height/2,y=c.cy+cos*c.height/2;
 return {left:x-width/2,right:x+width/2,top:y-height/2,bottom:y+height/2};
}
function compactLayout(cars,incidents,{left,laneWidth,project,laneX,angleAt,rampPosition,overview=false},preferred){
 const sprites=[];
 function append(c,staticBody=false){
  const designWidth=c.kind==='ambulance'?7:c.kind==='recovery'||c.truck?8:5;
  const designHeight=c.towing||c.kind==='recovery'?20:c.truck?13:c.kind==='ambulance'?10:6;
  const width=overview?(c.kind==='ambulance'?3:c.kind==='recovery'||c.truck?3.5:c.emergency||c.blocker?3:2.5):designWidth;
  const height=overview?(c.towing||c.kind==='recovery'?7:c.truck?6:c.kind==='ambulance'?4.5:c.emergency||c.blocker?4:3):designHeight;
  const slip=(c.onRamp!=null||c.slipRamp!=null)&&rampPosition?rampPosition(c):null;
  const cx=slip?slip.x:(laneX?laneX(c.x,c.lane<0?-1:c.visualLane):c.lane<0?left-10:left+(c.visualLane+.5)*laneWidth);
  const heading=slip?.angle??(angleAt?angleAt(c.x):0);
  const angle=overview?Math.max(-.02,Math.min(.02,heading)):heading;
  sprites.push({...c,static:staticBody,cx,cy:slip?slip.y:project(c.x),width,height,nominalHeight:height,designWidth,designHeight,angle,visible:true,packedOffset:0});
 }
 for(const c of cars)append(c);
 for(const i of incidents){
  const bodies=i.bodies??[{lane:i.lane,x:i.x,length:i.length,truck:i.truck,vehicleId:i.vehicleId}];
  for(let n=0;n<bodies.length;n++)append({...i,...bodies[n],bodyIndex:n,visualLane:bodies[n].lane},true);
 }
 sprites.sort((a,b)=>a.cy-b.cy||Number(b.static)-Number(a.static)||a.id-b.id);
 if(overview){
  let active=[];
  const present=new Set();
  for(const c of sprites){
   if(c.type==='roadworks')continue; // Cones, not a vehicle icon.
   const key=(c.static?'incident:':'vehicle:')+c.id+':'+(c.bodyIndex??0);
   present.add(key);
   const base=c.cx,shape=bounds(c),halfWidth=(shape.right-shape.left)/2;
   active=active.filter(b=>b.bottom+ICON_GAP>=shape.top);
   const maxSlot=Math.max(0,Math.floor((laneWidth/2-halfWidth-.3)/SLOT_PITCH));
   const previous=preferred.get(key)??0;
   const candidates=Array.from({length:maxSlot*2+1},(_,i)=>i-maxSlot).sort((a,b)=>Math.abs(a-previous)-Math.abs(b-previous)||Math.abs(a)-Math.abs(b)||a-b);
   const clear=slot=>{
    const box=bounds(c,base+slot*SLOT_PITCH);
    return !active.some(b=>box.left<b.right+ICON_GAP&&box.right+ICON_GAP>b.left&&box.top<b.bottom+ICON_GAP&&box.bottom+ICON_GAP>b.top);
   };
   let slot=candidates.find(clear);
   // Keep every icon separate even for an exceptional over-capacity layout.
   // Tests require no spill for physical motorway/slip-road queues.
   if(slot==null){c.packingOverflow=true;for(let n=maxSlot+1;slot==null;n++){if(clear(-n))slot=-n;else if(clear(n))slot=n;}}
   preferred.set(key,slot);c.packedOffset=slot*SLOT_PITCH;c.cx=base+c.packedOffset;
   active.push(bounds(c));
  }
  for(const key of preferred.keys())if(!present.has(key))preferred.delete(key);
 }
 return sprites;
}
export function layoutSprites(cars,incidents,options){return compactLayout(cars,incidents,options,new Map());}
export function createSpriteLayout(){const preferred=new Map();return(cars,incidents,options)=>compactLayout(cars,incidents,options,preferred);}
