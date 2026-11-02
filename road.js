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

// The acceleration lane follows a long, tangent-matched joining curve.
// Geometry and drawing share the same path used by the vehicle icons.
export function slipRoadPoint(geometry,ramp,worldX){
 const distance=Math.max(0,ramp.x-worldX),mergeLength=ramp.mergeLength??600;
 const outside=geometry.laneWidth+4,t=Math.max(0,Math.min(1,distance/mergeLength));
 const smooth=t*t*(3-2*t),extra=Math.max(0,distance-mergeLength);
 const offset=distance>mergeLength?outside+extra*extra*.00008:outside*smooth;
 const centerSlope=(geometry.center(worldX+1)-geometry.center(worldX-1))/2;
 const curveSlope=distance>mergeLength?extra*.00016:outside*6*t*(1-t)/mergeLength;
 return {x:geometry.laneX(worldX,0)-offset,y:geometry.project(worldX),angle:Math.atan2(centerSlope+curveSlope,geometry.scaleAt?geometry.scaleAt(worldX):geometry.scale)};
}
export function slipRoadEdges(geometry,ramp,worldX){
 const p=slipRoadPoint(geometry,ramp,worldX),distance=Math.max(0,ramp.x-worldX),mergeLength=ramp.mergeLength??600;
 const half=geometry.laneWidth/2;
 const t=Math.max(0,Math.min(1,distance/mergeLength)),smooth=t*t*(3-2*t);
 // The outer boundary meets the motorway edge tangentially; it never cuts
 // across the running lane or leaves a painted end cap on the carriageway.
 const outer=distance>mergeLength?p.x-half:geometry.leftAt(worldX)-(geometry.laneWidth+4)*smooth;
 return {outer,inner:p.x+half,y:p.y,connected:p.x+half>=geometry.leftAt(worldX)};
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

// A diverging branch starts tangentially in lane 1 and eases outwards.
export function offRampPoint(geometry,ramp,worldX){
 const start=ramp.x+100,t=Math.max(0,Math.min(1,(worldX-start)/600));
 const offset=(geometry.laneWidth+35)*t*t*(3-2*t);
 const slope=(geometry.center(worldX+1)-geometry.center(worldX-1))/2-(geometry.laneWidth+35)*6*t*(1-t)/600;
 return {x:geometry.laneX(worldX,0)-offset,y:geometry.project(worldX),angle:Math.atan2(slope,geometry.scale)};
}
