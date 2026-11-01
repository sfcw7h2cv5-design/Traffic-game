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
