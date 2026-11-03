// One projection is shared by the carriageway, vehicles and touch targets.
export function createRoadGeometry(width,height,length,viewLength=length,viewStart=0){
 const roadWidth=Math.min(width*.28,172),laneWidth=roadWidth/3;
 const amplitude=Math.min(width*.12,65);
 const center=x=>width/2+amplitude*(.75*Math.sin(x/length*Math.PI*2-.7)+.25*Math.sin(x/length*Math.PI*4+.4));
 const leftAt=x=>center(x)-roadWidth/2;
 const overview=viewLength===length;
 const top=overview?-24:30,bottom=overview?height+24:height-46,scale=(bottom-top)/viewLength;
 const project=x=>bottom-(x-viewStart)*scale;
 const unproject=y=>viewStart+(bottom-y)/scale;
 const scaleAt=()=>scale;
 const centerAtY=y=>center(unproject(y));
 const laneX=(x,lane)=>leftAt(x)+(lane<0?-10:(lane+.5)*laneWidth);
 const angleAt=x=>Math.atan2(center(x+1)-center(x-1),2*scale);
 return {width,height,roadWidth,laneWidth,leftAt,center,centerAtY,project,unproject,scale,scaleAt,laneX,angleAt};
}

// A curved feeder leads into a parallel acceleration lane, then a joining
// taper. Vehicles and pavement always use the same fixed world projection.
export function slipRoadPoint(geometry,ramp,worldX,vehicle){
 const approach=ramp.approachLength??1100,acceleration=ramp.mergeLength??600,taper=ramp.joinTaper??200;
 const d=Math.max(0,ramp.x-worldX),parallel=geometry.laneWidth*.725;
 const smooth=t=>t*t*(3-2*t),slope=t=>6*t*(1-t);
 let offset,rate;
 if(vehicle?.rampMerging&&vehicle.rampMergeStart!=null){
  const distance=Math.max(1,ramp.x-vehicle.rampMergeStart),t=Math.max(0,Math.min(1,vehicle.rampSteerProgress??(worldX-vehicle.rampMergeStart)/distance));
  offset=parallel*(1-smooth(t));
  const lateralSpeed=parallel*slope(t)/(vehicle.rampSteerDuration??(vehicle.truck?5.5:4.5));
  const yaw=Math.min(.3,Math.atan2(lateralSpeed,Math.max(2,(vehicle.v??0)*geometry.scale)));
  return {x:geometry.laneX(worldX,0)-offset,y:geometry.project(worldX),angle:geometry.angleAt(worldX)+yaw};
 }
 else if(d<taper){const t=d/taper;offset=parallel*smooth(t);rate=parallel*slope(t)/taper;}
 else if(d<=acceleration){offset=parallel;rate=0;}
 else{const t=Math.min(1,(d-acceleration)/(approach-acceleration)),extra=geometry.laneWidth*1.175+8;offset=parallel+extra*smooth(t);rate=extra*slope(t)/(approach-acceleration);}
 const roadSlope=(geometry.center(worldX+1)-geometry.center(worldX-1))/2;
 return {x:geometry.laneX(worldX,0)-offset,y:geometry.project(worldX),angle:Math.atan2(roadSlope+rate,geometry.scale)};
}
export function rampEdges(geometry,p){
 const half=geometry.laneWidth*.45/2,dx=half*Math.cos(p.angle),dy=half*Math.sin(p.angle);
 const outer={x:p.x-dx,y:p.y-dy},inner={x:p.x+dx,y:p.y+dy};
 return {outer,inner,connected:inner.x>=geometry.leftAt(geometry.unproject(inner.y))};
}
export function slipRoadEdges(geometry,ramp,worldX){
 const p=slipRoadPoint(geometry,ramp,worldX),edges=rampEdges(geometry,p);
 return {outer:edges.outer.x,inner:edges.inner.x,y:p.y,outerPoint:edges.outer,innerPoint:edges.inner,connected:edges.connected};
}

// Space cones by screen distance, not a fixed count in a tiny patch of road.
export function roadworkCones(geometry,work){
 const low=Math.min(...work.lanes),high=Math.max(...work.lanes);
 const leftClosure=low===0,edge=leftClosure?high+1:low,startEdge=leftClosure?low:high+1;
 const back=work.x-work.length,taper=back-250,result=[];
 const point=(x,laneFraction)=>({x:geometry.leftAt(x)+laneFraction*geometry.laneWidth,y:geometry.project(x)});
 const add=(p,role)=>{if(result.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>=6))result.push({...p,role});};
 const a=point(taper,startEdge),b=point(back,edge);
 const count=Math.max(3,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/11));
 for(let i=0;i<=count;i++){const t=i/count;add(point(taper+250*t,startEdge+(edge-startEdge)*t),'taper');}
 const n=Math.max(1,Math.ceil(Math.abs(geometry.project(back)-geometry.project(work.x))/11));
 for(let i=0;i<=n;i++){const x=back+work.length*i/n;add(point(x,edge),'boundary');add(point(x,leftClosure?low:high+1),'outer');}
 const ends=Math.max(2,Math.ceil((high+1-low)*geometry.laneWidth/11));
 for(let i=0;i<=ends;i++)add(point(work.x,low+(high+1-low)*i/ends),'end');
 return result;
}

// First move into a parallel deceleration lane, then leave along the ramp.
export function offRampPoint(geometry,ramp,worldX){
 const start=ramp.offStart??ramp.x-1750,length=ramp.offLength??850,depart=ramp.offDeparture??300;
 const travelled=Math.max(0,worldX-start),parallel=geometry.laneWidth*.725,split=Math.max(length*.6,depart);
 const smooth=t=>t*t*(3-2*t),slope=t=>6*t*(1-t);
 let offset,rate;
 if(travelled<depart){const t=travelled/depart;offset=parallel*smooth(t);rate=parallel*slope(t)/depart;}
 else if(travelled<split){offset=parallel;rate=0;}
 else{const t=Math.min(1,(travelled-split)/(length-split)),extra=geometry.laneWidth*.175+2;offset=parallel+extra*smooth(t);rate=extra*slope(t)/(length-split);}
 const roadSlope=(geometry.center(worldX+1)-geometry.center(worldX-1))/2;
 return {x:geometry.laneX(worldX,0)-offset,y:geometry.project(worldX),angle:Math.atan2(roadSlope-rate,geometry.scale)};
}
