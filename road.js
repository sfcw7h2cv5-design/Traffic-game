// One projection is shared by the carriageway, vehicles and touch targets.
export function createRoadGeometry(width,height,length,viewLength=length,viewStart=0){
 const roadWidth=Math.min(width*.36,220),laneWidth=roadWidth/3;
 const amplitude=Math.min(width*.12,65);
 const center=x=>width/2+amplitude*(.75*Math.sin(x/length*Math.PI*2-.7)+.25*Math.sin(x/length*Math.PI*4+.4));
 const leftAt=x=>center(x)-roadWidth/2;
 const overview=viewLength===length;
 const top=overview?-24:30,bottom=overview?height+24:height-46,scale=(bottom-top)/viewLength;
 const project=x=>bottom-(x-viewStart)*scale;
 const laneX=(x,lane)=>leftAt(x)+(lane<0?-10:(lane+.5)*laneWidth);
 const angleAt=x=>Math.atan2(center(x+1)-center(x-1),2*scale);
 return {width,height,roadWidth,laneWidth,leftAt,center,project,scale,laneX,angleAt};
}

// The slip road remains left of lane 1 until its final, gradual joining taper.
export function slipRoadPoint(geometry,ramp,worldX){
 const distance=ramp.x-worldX;
 const outside=geometry.laneWidth/2+24;
 const t=Math.max(0,Math.min(1,distance/120));
 const smooth=t*t*(3-2*t);
 const offset=distance>120?outside+(distance-120)*.16:outside*smooth;
 return {x:geometry.laneX(worldX,0)-offset,y:geometry.project(worldX)};
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
