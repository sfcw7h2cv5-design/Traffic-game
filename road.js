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

// Keep the full physical approach, but turn its outer feeder in from the
// map edge. Only the feeder is schematic; the main road projection is fixed.
export function slipRoadPoint(geometry,ramp,worldX){
 const mergeLength=ramp.mergeLength??600,d=Math.max(0,ramp.x-worldX),outside=geometry.laneWidth+4;
 if(d<=mergeLength){
  const t=d/mergeLength,shown=ramp.x-d*.7;
  const smooth=t*t*t*(10+t*(-15+6*t)),slope=30*t*t*(1-t)*(1-t);
  const centerSlope=(geometry.center(shown+1)-geometry.center(shown-1))/2;
  return {x:geometry.laneX(shown,0)-outside*smooth,y:geometry.project(shown),angle:Math.atan2(centerSlope*.7+outside*slope/mergeLength,geometry.scale*.7)};
 }
 const shown=ramp.x-mergeLength*.7,base={x:geometry.laneX(shown,0)-outside,y:geometry.project(shown)},angle=geometry.angleAt(shown);
 return feederCurve(geometry,base,angle,d-mergeLength,250,false);
}
// A circular bend followed by an open feeder keeps a bounded bend radius.
// Local rotations match the carriageway tangent at every branch connection.
function feederCurve(geometry,base,angle,d,turnLength,exit){
 const radius=geometry.laneWidth*.45,t=Math.min(1,Math.max(0,d/turnLength));
 const turn=(exit?-Math.PI/2:Math.PI/2)-angle,phi=angle+turn*t;
 const extra=Math.max(0,d-turnLength),m=radius*Math.abs(turn)/turnLength;
 const extension=m*extra+geometry.width*(extra/250)**2;
 const x=base.x+radius*(Math.cos(phi)-Math.cos(angle))-extension;
 const y=base.y+radius*(Math.sin(phi)-Math.sin(angle));
 const dx=extra>0?-m-2*geometry.width*extra/62500:-radius*Math.sin(phi)*turn/turnLength;
 const dy=extra>0?0:radius*Math.cos(phi)*turn/turnLength;
 return {x,y,angle:Math.atan2(exit?dx:-dx,exit?-dy:dy)};
}
export function rampEdges(geometry,p){
 const half=geometry.laneWidth*.4/2,dx=half*Math.cos(p.angle),dy=half*Math.sin(p.angle);
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

// Leave before the incoming feeder, following a long curve out of the map.
export function offRampPoint(geometry,ramp,worldX){
 const start=ramp.offStart??ramp.x-1150,length=ramp.offLength??350;
 return feederCurve(geometry,{x:geometry.laneX(start,0),y:geometry.project(start)},geometry.angleAt(start),Math.max(0,worldX-start),length/2,true);
}
