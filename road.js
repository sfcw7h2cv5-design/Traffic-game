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

// Long, shallow slip-road tapers share the motorway world projection.
// The outside approach remains parallel to the motorway, with no right-angle
// feeder. Geometry never depends on traffic or a queue length.
export function slipRoadPoint(geometry,ramp,worldX){
 const length=ramp.approachLength??1100,d=Math.max(0,ramp.x-worldX),t=Math.min(1,d/length);
 const outside=geometry.laneWidth*1.8+8,smooth=t*t*(3-2*t);
 const slope=(geometry.center(worldX+1)-geometry.center(worldX-1))/2+outside*6*t*(1-t)/length;
 return {x:geometry.laneX(worldX,0)-outside*smooth,y:geometry.project(worldX),angle:Math.atan2(slope,geometry.scale)};
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

// The exit diverges gradually before the joining taper, then fades into the
// local road network. It never turns into a horizontal cross-road.
export function offRampPoint(geometry,ramp,worldX){
 const start=ramp.offStart??ramp.x-1150,length=ramp.offLength??450;
 const t=Math.max(0,Math.min(1,(worldX-start)/length)),outside=geometry.laneWidth*.7+4;
 const smooth=t*t*(3-2*t);
 const slope=(geometry.center(worldX+1)-geometry.center(worldX-1))/2-outside*6*t*(1-t)/length;
 return {x:geometry.laneX(worldX,0)-outside*smooth,y:geometry.project(worldX),angle:Math.atan2(slope,geometry.scale)};
}
