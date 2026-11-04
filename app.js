import {Simulation,LENGTH,GANTRIES} from './model.js?v=37';
import {createSpriteLayout} from './display.js?v=37';
import {createRoadGeometry,slipRoadPoint,slipRoadEdges,offRampPoint,rampEdges,roadworkCones} from './road.js?v=37';
const placeSprites=createSpriteLayout();
const elements=new Map(),$=s=>{if(!elements.has(s))elements.set(s,document.querySelector(s));return elements.get(s)},sim=new Simulation();window.sim=sim;
let selected=1,laneScope='all',rate=1,paused=false,editorOpener=null;
let VIEW_LENGTH=LENGTH,viewStart=0,detailArmed=false,lastDeskUpdate=-Infinity;
const canvas=$('#road'),ctx=canvas.getContext('2d'),editor=$('#inlineSignals');
function notify(text){$('#event').textContent=text}
function closeEditor(){editor.hidden=true;editorOpener?.setAttribute('aria-expanded','false')}
let activeRamp=null;
function closeRamp(){activeRamp=null;$('#rampControls').hidden=true;}
const operations=sim.systems;
let cachedGeometry=null,geometryKey='';
function roadGeometry(){
 const w=canvas.clientWidth,h=canvas.clientHeight,key=[w,h,VIEW_LENGTH,viewStart].join('/');
 if(key!==geometryKey){geometryKey=key;cachedGeometry=createRoadGeometry(w,h,LENGTH,VIEW_LENGTH,viewStart)}
 return cachedGeometry;
}
function positionTargets(){const geo=roadGeometry();document.querySelectorAll('[data-gantry]').forEach(b=>{const lane=b.dataset.lane,x=GANTRIES[+b.dataset.gantry],left=geo.leftAt(x);b.style.left=(lane==='all'?Math.min(geo.width-46,left+geo.roadWidth+16):left+(+lane)*geo.laneWidth)+'px';b.style.width=(lane==='all'?42:geo.laneWidth)+'px';const gy=geo.project(x);b.hidden=gy<20||gy>canvas.clientHeight-20;b.style.top=gy+'px'});if(!editor.hidden)positionEditor();positionJunctions()}
function positionEditor(){const geo=roadGeometry(),h=geo.height;const gy=geo.project(GANTRIES[selected]),eh=editor.offsetHeight;editor.style.top=Math.max(8,Math.min(h-eh-40,gy+(gy<h/2?27:-eh-27)))+'px'}
$('#gantryTargets').innerHTML=GANTRIES.map((g,i)=>['all',0,1,2].map(l=>`<button class="road-sign-target ${l==='all'?'gantry-side':''}" data-gantry="${i}" data-lane="${l}" aria-label="Gantry ${String(i+1).padStart(2,'0')} ${l==='all'?'all lanes':'lane '+(+l+1)}" aria-expanded="false" aria-controls="inlineSignals">${l==='all'?`G${String(i+1).padStart(2,'0')}<small>ALL</small>`:''}</button>`).join('')).join('');
function renderEditor(){
 $('#inlineTitle').textContent=`G${String(selected+1).padStart(2,'0')} · ${laneScope==='all'?'All lanes':'Lane '+(+laneScope+1)}`;
 const signals=laneScope==='all'?sim.signals[selected]:[sim.signals[selected][+laneScope]];
 $('#inlineSpeeds').innerHTML=[20,30,40,50,60,70].map(v=>`<button data-speed="${v}" aria-label="${v} mph" aria-pressed="${signals.every(s=>s.speed===v)}">${v}</button>`).join('');
 const modes=[['open','Open'],...(laneScope!=='0'?[['merge-left','Left ↖']]:[]),...(laneScope!=='2'?[['merge-right','Right ↗']]:[]),['closed','Close ×']];
 $('#inlineModes').innerHTML=modes.map(([mode,label])=>`<button data-mode="${mode}" aria-pressed="${signals.every(s=>s.mode===mode)}">${label}</button>`).join('');
 updateInlineReading();positionEditor();
}
$('#gantryTargets').onclick=e=>{const b=e.target.closest('[data-gantry]');if(!b)return;closeRamp();if(detailArmed){selected=+b.dataset.gantry;openDetail(GANTRIES[selected]);return;}closeEditor();editorOpener=b;selected=+b.dataset.gantry;laneScope=b.dataset.lane;editor.hidden=false;b.setAttribute('aria-expanded','true');renderEditor()};
$('#inlineSpeeds').onclick=e=>{const b=e.target.closest('[data-speed]');if(!b)return;const lanes=laneScope==='all'?[0,1,2]:[+laneScope];lanes.forEach(l=>sim.signals[selected][l].speed=+b.dataset.speed);renderEditor()};
$('#inlineModes').onclick=e=>{const b=e.target.closest('[data-mode]');if(!b)return;(laneScope==='all'?[0,1,2]:[+laneScope]).forEach(l=>sim.signals[selected][l].mode=b.dataset.mode==='merge-left'&&l===0||b.dataset.mode==='merge-right'&&l===2?'open':b.dataset.mode);renderEditor()};
$('#closeInline').onclick=closeEditor;
editor.addEventListener('click',e=>e.stopPropagation());
$('.mapwrap').addEventListener('click',e=>{
 if(detailArmed){
  const rect=canvas.getBoundingClientRect(),geo=roadGeometry();
  const world=geo.unproject(e.clientY-rect.top);
  openDetail(world);return;
 }
 if(!e.target.closest('#inlineSignals')&&!e.target.closest('[data-gantry]'))closeEditor();if(!e.target.closest('#rampControls')&&!e.target.closest('[data-ramp]'))closeRamp();
});
function updateDetailNavigation(){
 $('#detailNavigation').hidden=VIEW_LENGTH===LENGTH;
 $('#detailRange').textContent=(viewStart/1000).toFixed(2)+'–'+((viewStart+VIEW_LENGTH)/1000).toFixed(2)+' km';
 $('#detailPrevious').disabled=viewStart<=0;$('#detailNext').disabled=viewStart+VIEW_LENGTH>=LENGTH;
}
function openDetail(x){
 detailArmed=false;$('#zoomPrompt').hidden=true;canvas.classList.add('detail-view');VIEW_LENGTH=400;viewStart=Math.max(0,Math.min(LENGTH-400,x-200));
 $('#viewMode').textContent='Show all';$('#viewMode').setAttribute('aria-pressed','true');closeEditor();closeRamp();positionTargets();updateDetailNavigation();
}
function showAll(){canvas.classList.remove('detail-view');detailArmed=false;VIEW_LENGTH=LENGTH;viewStart=0;$('#zoomPrompt').hidden=true;$('#viewMode').textContent='Detail';$('#viewMode').setAttribute('aria-pressed','false');closeEditor();closeRamp();positionTargets();updateDetailNavigation();}
$('#viewMode').onclick=()=>{closeRamp();
 if(VIEW_LENGTH!==LENGTH){showAll();return;}
 detailArmed=!detailArmed;closeEditor();$('#zoomPrompt').hidden=!detailArmed;$('#viewMode').textContent=detailArmed?'Cancel zoom':'Detail';$('#viewMode').setAttribute('aria-pressed',String(detailArmed));
};
$('#detailPrevious').onclick=()=>{viewStart=Math.max(0,viewStart-400);closeEditor();closeRamp();positionTargets();updateDetailNavigation()};
$('#detailNext').onclick=()=>{viewStart=Math.min(LENGTH-400,viewStart+400);closeEditor();closeRamp();positionTargets();updateDetailNavigation()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(detailArmed)showAll();else closeEditor()}});
new ResizeObserver(positionTargets).observe(canvas);positionTargets();updateDetailNavigation();
function updateTrafficDesk(){
 const advice=sim.trafficAdvice();$('#stoppedCount').textContent=advice.stopped;$('#brakingCount').textContent=advice.hardBrakes;
 const g=advice.gantry;
 $('#trafficAdvice').textContent=advice.kind==='queue'?(g>=0?`Queue tail at ${(advice.tail/1000).toFixed(2)} km. Try ${advice.targetSpeed} mph at G${String(g+1).padStart(2,'0')} to smooth approaching traffic.`:'A queue has reached the entry. Keep the open lanes flowing and monitor recovery.'):advice.kind==='incident'?`Incident ahead at ${(advice.tail/1000).toFixed(2)} km. ${g>=0?'Consider 50 mph at G'+String(g+1).padStart(2,'0')+' before traffic builds.':'Protect approaching traffic with your signals.'}`:'Traffic is flowing. Higher limits suit a clear road; lower limits are useful before queues, not everywhere.';
 const open=g>=0?sim.signals[g].filter(s=>s.mode==='open'):[];const matched=open.length>0&&open.every(s=>s.speed===advice.targetSpeed);
 $('#applyAdvice').hidden=g<0||advice.kind==='clear';$('#applyAdvice').disabled=matched||!open.length;
 $('#applyAdvice').textContent=!open.length?'Selected approach has no open lanes':matched?'Approach limits set · monitor flow':'Set suggested approach limits';
}
$('#applyAdvice').onclick=()=>{
 const advice=sim.trafficAdvice();if(advice.gantry<0||advice.kind==='clear')return;
 sim.signals[advice.gantry].forEach(s=>{if(s.mode==='open')s.speed=advice.targetSpeed});
 if(advice.gantry>0)sim.signals[advice.gantry-1].forEach(s=>{if(s.mode==='open')s.speed=Math.min(s.speed,advice.targetSpeed+10)});
 notify(`Approach limits set before ${(advice.tail/1000).toFixed(2)} km. Watch braking and flow, and raise limits when the queue clears.`);updateTrafficDesk();if(!editor.hidden)renderEditor();
};
function positionJunctions(){
 const geo=roadGeometry();document.querySelectorAll('[data-ramp]').forEach(b=>{const r=operations.ramps[+b.dataset.ramp],y=geo.project(r.x);b.hidden=y<20||y>geo.height-30;b.style.left=Math.max(3,geo.leftAt(r.x)-73)+'px';b.style.top=y+'px'});
 if(activeRamp!=null){const r=operations.ramps[activeRamp];$('#rampControls').style.top=Math.max(8,Math.min(geo.height-190,geo.project(r.x)+28))+'px';}
}
$('#rampTargets').innerHTML=operations.ramps.map(r=>'<button class="ramp-target" data-ramp="'+r.id+'" aria-label="'+r.name+' slip-road closure">'+r.name+'<span id="rampState'+r.id+'"></span></button>').join('');
$('#rampTargets').onclick=e=>{const b=e.target.closest('[data-ramp]');if(!b)return;if(detailArmed){openDetail(operations.ramps[+b.dataset.ramp].x);return;}closeEditor();activeRamp=+b.dataset.ramp;$('#rampControls').hidden=false;updateRampEditor();positionJunctions()};
$('#rampControls').addEventListener('click',e=>e.stopPropagation());
$('#closeRamp').onclick=closeRamp;
$('#rampControls').onclick=e=>{const b=e.target.closest('[data-ramp-choice]');if(b&&activeRamp!=null){operations.setRampMode(activeRamp,b.dataset.rampChoice);updateRampEditor();updateOperations()}};
function updateRampEditor(){if(activeRamp==null)return;const r=operations.ramps[activeRamp];$('#rampTitle').textContent=r.name+' · slip-road closure';$('#rampReading').textContent=r.queue.length+' vehicles waiting · '+r.joined+' joined';document.querySelectorAll('[data-ramp-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rampChoice===r.mode)))}
$('#rampsList').innerHTML=operations.ramps.map(r=>'<div class="ramp-row"><div><b>'+r.name+' · '+(r.x/1000).toFixed(1)+' km</b><small id="rampQueue'+r.id+'">0 waiting</small></div><select data-ramp-mode="'+r.id+'" aria-label="'+r.name+' slip-road state"><option value="open">Open</option><option value="closed">Closed</option></select></div>').join('');
$('#rampsList').onchange=e=>{if(e.target.dataset.rampMode!=null){operations.setRampMode(+e.target.dataset.rampMode,e.target.value);updateRampEditor()}};
$('#protectWorks').onclick=()=>{operations.protectWorks();updateOperations()};
$('#objectiveList').innerHTML=operations.objectives.map(o=>'<div class="objective"><label for="goal-'+o.id+'">'+o.title+'</label><progress id="goal-'+o.id+'" max="'+o.target+'" value="0"></progress><small id="goalReading-'+o.id+'">0 / '+o.target+'</small></div>').join('');
function updateOperations(){
 const phase=operations.phase,w=operations.work,b=operations.roadblock;
 const workVisible=['announced','awaiting-protection','working','safety-paused'].includes(w.status);
 const before=GANTRIES.findLastIndex(x=>x<w.x),section='G'+String(before+1).padStart(2,'0')+(before+1<GANTRIES.length?'–G'+String(before+2).padStart(2,'0'):'–exit');
 const lanes='Lane'+(w.lanes.length>1?'s ':' ')+w.lanes.map(l=>l+1).join(' & ');
 const workStatus=w.status==='safety-paused'?'Roadworks paused — restore protection':w.status==='working'?'Roadworks active':w.status==='awaiting-protection'?'Roadworks awaiting protection':'Roadworks due';
 const notice=workVisible?workStatus+' · '+(w.x/1000).toFixed(1)+' km · '+section+' · '+lanes:phase.name+' · '+(['rolling','clearing'].includes(b.status)?'Police hold active':operations.ramps.length+' junctions online');
 if($('#networkNotice').textContent!==notice)$('#networkNotice').textContent=notice;
 for(const r of operations.ramps){$('#rampQueue'+r.id).textContent=r.queue.length+' waiting · '+r.joined+' joined';$('#rampState'+r.id).textContent=r.mode==='closed'?' ×':'';const select=document.querySelector('[data-ramp-mode="'+r.id+'"]');if(select.value!==r.mode)select.value=r.mode;}
 $('#networkNotice').classList.toggle('urgent',w.status==='awaiting-protection'||w.status==='safety-paused');
 const g=operations.protectionGantry();
 $('#workReading').textContent=w.status==='complete'?'Work complete. Reopen the protected lanes when ready.':w.status==='working'?'Crews working at '+(w.x/1000).toFixed(1)+' km · '+Math.ceil(w.remaining/3)+'s at 1× remaining.':w.status==='safety-paused'?'Workers withdrawn: restore the closure at G'+String(g+1).padStart(2,'0')+' to resume.':'Work planned at '+(w.x/1000).toFixed(1)+' km. Close lane'+(w.lanes.length>1?'s ':' ')+w.lanes.map(l=>l+1).join(' & ')+' at G'+String(g+1).padStart(2,'0')+' before crews enter.';
 $('#protectWorks').disabled=w.status==='complete';
 $('#policeReading').textContent=b.status==='scheduled'?'A rolling hold is scheduled to create space for a debris team.':b.status==='rolling'?'Police are holding traffic at about 20 mph to open a safe work gap.':b.status==='clearing'?'The debris team is clearing the gap. Police will release traffic automatically.':'Clearance complete. The police convoy has released traffic.';
 let complete=0;for(const o of operations.objectives){$('#goal-'+o.id).value=o.progress;$('#goalReading-'+o.id).textContent=o.complete?'✓ Complete':o.progress+' / '+o.target;if(o.complete)complete++;}$('#objectiveCount').textContent=complete+'/'+operations.objectives.length;
 updateRampEditor();
}
new ResizeObserver(positionJunctions).observe(canvas);updateOperations();
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeRamp()});
function updateResponseStatus(){let fastest=null;for(const c of sim.cars)if(c.emergency&&c.x>=0&&c.x<LENGTH&&(!fastest||c.v>fastest.v))fastest=c;$('#responseStatus').textContent=fastest?(fastest.kind==='police'?'Police':'Ambulance')+' · '+Math.round(fastest.v/.44704)+' mph':'Network connected'}
function updateInlineReading(){if(editor.hidden)return;const cars=sim.cars.filter(c=>c.x>=GANTRIES[selected]&&c.x<(GANTRIES[selected+1]??LENGTH)&&(laneScope==='all'?c.lane>=0:c.lane===+laneScope));$('#inlineActual').textContent=cars.length?'Actual '+Math.round(cars.reduce((n,c)=>n+c.v,0)/cars.length/.44704)+' mph · changes apply downstream':'No traffic in this section'}
$('#pause').onclick=()=>{paused=!paused;$('#pause').textContent=paused?'▶':'❚❚';$('#pause').setAttribute('aria-label',paused?'Resume simulation':'Pause simulation')};
$('#rate').onclick=()=>{rate=rate===1?2:rate===2?4:1;$('#rate').textContent=rate+'×'};
$('#help').onclick=()=>$('#guide').showModal();$('#closeHelp').onclick=$('#begin').onclick=()=>$('#guide').close();
// The road surface does not change between frames. Repaint only for resize/zoom.
let scenery=null,sceneryKey='';
let roadSurface=null,roadSurfaceKey='';
function roadPath(ctx,geo,offset){
 ctx.beginPath();for(let py=-80;py<=geo.height+80;py+=6){const px=geo.centerAtY(py)+offset;if(py===-80)ctx.moveTo(px,py);else ctx.lineTo(px,py);}
}
function paintScenery(ctx,geo){
 const {width:w,height:h,roadWidth:roadW,laneWidth:lw,project:y}=geo,dpr=Math.min(devicePixelRatio||1,2);
 const surfaceKey=[w,h,dpr,VIEW_LENGTH,viewStart].join('/');
 if(surfaceKey!==roadSurfaceKey){
  roadSurfaceKey=surfaceKey;roadSurface=document.createElement('canvas');roadSurface.width=Math.round(w*dpr);roadSurface.height=Math.round(h*dpr);
  const base=roadSurface.getContext('2d');base.setTransform(dpr,0,0,dpr,0,0);base.fillStyle='#1d3938';base.fillRect(0,0,w,h);
  roadPath(base,geo,0);base.strokeStyle='#283d40';base.lineWidth=roadW+20;base.stroke();
  roadPath(base,geo,0);base.strokeStyle='#35464a';base.lineWidth=roadW;base.stroke();
  roadPath(base,geo,roadW/2);base.strokeStyle='#a2b3a2';base.lineWidth=1;base.stroke();
  base.save();base.translate(w-15,h/2);base.rotate(-Math.PI/2);base.fillStyle='#79968c';base.font='9px sans-serif';base.fillText('NORTHBOUND  →',-45,0);base.restore();
 }
 ctx.drawImage(roadSurface,0,0,w,h);
 // Sample both branch types from their shared vehicle paths. Edge offsets
 // follow the curve normals, preserving one lane width even on tight bends.
 const branches=[];
 for(const r of operations.ramps)for(const exit of [true,false]){
  const start=exit?r.offStart:r.x-r.approachLength,end=exit?r.offStart+r.offLength:r.x;
  const point=exit?offRampPoint:slipRoadPoint,points=[];
  const count=Math.max(100,Math.ceil((end-start)*geo.scale/3));
  for(let n=0;n<=count;n++){const p=point(geo,r,start+(end-start)*n/count);points.push({...p,...rampEdges(geo,p)});}
  if(points.every(p=>p.y<-100)||points.every(p=>p.y>h+100))continue;
  branches.push({r,exit,points});
 }
 const branchInk=(points,exit,color)=>{const g=ctx.createLinearGradient(0,points[0].y,0,points.at(-1).y);if(exit){g.addColorStop(0,color);g.addColorStop(.95,color);g.addColorStop(1,color+'00');}else{g.addColorStop(0,color+'00');g.addColorStop(.08,color);g.addColorStop(1,color);}return g;};
 const edgePath=(points,key)=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[key].x,p[key].y):ctx.moveTo(p[key].x,p[key].y));};
 for(const {points,exit} of branches){
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.outer.x,p.outer.y):ctx.moveTo(p.outer.x,p.outer.y));
  for(let i=points.length-1;i>=0;i--)ctx.lineTo(points[i].inner.x,points[i].inner.y);
  ctx.closePath();ctx.fillStyle=branchInk(points,exit,'#35464a');ctx.fill();
 }
 // Open the carriageway edge only where a branch actually meets it.
 const openings=branches.map(b=>b.points.filter(p=>p.connected)).filter(p=>p.length).map(points=>({low:Math.min(...points.map(p=>p.inner.y)),high:Math.max(...points.map(p=>p.inner.y))}));
 ctx.strokeStyle='#a2b3a2';ctx.lineWidth=1;ctx.setLineDash([]);ctx.beginPath();
 for(let py=-80;py<h+80;py+=2){if(openings.some(o=>py>=o.low-2&&py<=o.high+2))continue;ctx.moveTo(geo.centerAtY(py)-roadW/2,py);ctx.lineTo(geo.centerAtY(py+2)-roadW/2,py+2);}
 ctx.stroke();
 for(const {points,exit} of branches){
  ctx.strokeStyle=branchInk(points,exit,'#a2b3a2');
  const outside=points.filter(p=>p.outer.x<geo.leftAt(geo.unproject(p.outer.y)));if(outside.length){edgePath(outside,'outer');ctx.stroke();}
  const separate=points.filter(p=>!p.connected);if(separate.length){edgePath(separate,'inner');ctx.stroke();}
  // Short broken edge lines guide traffic through the open mouth.
  const connected=points.filter(p=>p.connected);
  if(connected.length>1){ctx.save();ctx.strokeStyle='#a2b3a299';ctx.setLineDash([3,6]);ctx.beginPath();connected.forEach((p,i)=>{const x=geo.leftAt(geo.unproject(p.y));if(i)ctx.lineTo(x,p.y);else ctx.moveTo(x,p.y);});ctx.stroke();ctx.restore();}
  if(exit){const p=points[Math.floor(points.length*.2)];ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.strokeStyle='#cad8c1';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(0,5);ctx.lineTo(0,-5);ctx.moveTo(-3,-1);ctx.lineTo(0,-5);ctx.lineTo(3,-1);ctx.stroke();ctx.restore();}
 }
 // Dashed auxiliary-lane boundaries and hatched gores make the join and
 // exit locations explicit, while the solid edge prevents early crossing.
 for(const r of operations.ramps){
  for(const exit of [true,false]){
   const start=exit?r.offStart+r.offDeparture:r.x-r.mergeLength,end=exit?r.offStart+r.offLength*.6:r.x-r.joinTaper;
   ctx.save();ctx.setLineDash([4,5]);ctx.strokeStyle='#d6e2c6';ctx.lineWidth=1;ctx.beginPath();
   for(let n=0;n<=30;n++){const x=start+(end-start)*n/30,px=geo.leftAt(x),py=y(x);if(n)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.stroke();ctx.restore();
   const point=(exit?offRampPoint:slipRoadPoint)(geo,r,(start+end)/2);
   ctx.save();ctx.fillStyle='#c8d8b9';ctx.font='bold 8px sans-serif';ctx.textAlign='right';ctx.fillText(exit?'DECEL / EXIT':'ACCEL',point.x-geo.laneWidth*.25-4,point.y+3);ctx.restore();
   const low=exit?r.offStart+r.offLength*.6:r.x-r.mergeLength-180,high=exit?r.offStart+r.offLength:r.x-r.mergeLength;
   const path=exit?offRampPoint:slipRoadPoint,edge=[];
   for(let n=0;n<=30;n++){const x=low+(high-low)*n/30,p=path(geo,r,x),inner=rampEdges(geo,p).inner;edge.push({inner,main:{x:geo.leftAt(x),y:y(x)}});}
   ctx.save();ctx.beginPath();edge.forEach((p,i)=>i?ctx.lineTo(p.inner.x,p.inner.y):ctx.moveTo(p.inner.x,p.inner.y));for(let n=edge.length-1;n>=0;n--)ctx.lineTo(edge[n].main.x,edge[n].main.y);ctx.closePath();ctx.clip();ctx.strokeStyle='#9bae9077';ctx.lineWidth=1;ctx.beginPath();
   const minY=Math.min(y(low),y(high)),maxY=Math.max(y(low),y(high));for(let py=minY-20;py<maxY+20;py+=7){ctx.moveTo(0,py);ctx.lineTo(w,py+w*.4);}ctx.stroke();ctx.restore();
  }
 }
 ctx.setLineDash([8,12]);for(const offset of [-roadW/2+lw,-roadW/2+lw*2]){roadPath(ctx,geo,offset);ctx.strokeStyle='#82938b88';ctx.lineWidth=1;ctx.stroke();}ctx.setLineDash([]);
 ctx.font='9px sans-serif';ctx.fillStyle='#91aa99';ctx.textAlign='right';
 const tick=VIEW_LENGTH===LENGTH?1000:100;
 for(let m=Math.ceil(viewStart/tick)*tick;m<=viewStart+VIEW_LENGTH;m+=tick){const left=geo.leftAt(m);ctx.fillText((m/1000).toFixed(1)+' km',left-17,y(m));ctx.fillRect(left-12,y(m),7,1);}
}
// Reuse the small painted vehicle icons instead of rebuilding their paths
// and details hundreds of times per frame.
const vehicleIcons=new Map();
function vehicleIcon(c){
 const family=c.kind||(c.truck?'hgv':'car');
 const small=VIEW_LENGTH===LENGTH;
 const color=c.static?'#ffab86':c.kind==='police'||c.kind==='roadblock'?'#f4fff1':c.kind==='ambulance'?'#f1ff74':c.kind==='recovery'?'#ffc65f':c.truck?'#fff0bd':c.braking?'#ffd18a':['#e1fff0','#b0edff','#dcf7b0','#f5fff4'][c.id%4];
 const flash=c.emergency||c.blocker?Math.floor(sim.elapsed*7)%2:c.static?Math.floor(sim.elapsed*2)%2:0;
 const key=family+'/'+color+'/'+!!c.towing+'/'+!!c.static+'/'+flash+'/'+small;
 if(!vehicleIcons.has(key)){
  const icon=document.createElement('canvas'),height=c.designHeight,width=c.designWidth??c.width,cx=7,cy=0;icon.width=28;icon.height=(height+2)*2;
  const ctx=icon.getContext('2d');ctx.scale(2,2);
 ctx.fillStyle=color;
 ctx.beginPath();ctx.roundRect(cx-width/2,cy,width,height,1);ctx.fill();if(!small){ctx.fillStyle='#385a63';ctx.fillRect(cx-width/2+.6,cy+1,width-1.2,2);}
 if(c.kind==='ambulance'||c.kind==='police'||c.kind==='roadblock'){if(small){ctx.fillStyle=flash?'#65d9ff':'#f4ffff';ctx.fillRect(cx-width/2,cy,width,height);}else{ctx.fillStyle='#76a85c';ctx.fillRect(cx-width/2,cy+4,width,2);ctx.fillStyle=Math.floor(sim.elapsed*7)%2?'#45c5ff':'#e5faff';ctx.fillRect(cx-width/2,cy+2,2,2);ctx.fillRect(cx+width/2-2,cy+2,2,2)}}
 if(c.kind==='recovery'){ctx.fillStyle='#fff3ab';ctx.fillRect(cx-4,cy+3,8,2);if(c.towing){ctx.fillStyle='#df8d72';ctx.fillRect(cx-2.5,cy+12,5,7)}}
 if(c.truck&&!small){ctx.fillStyle='#8c9571';ctx.fillRect(cx-width/2+1,cy+5,width-2,1)}
 if(c.static){if(Math.floor(sim.elapsed*2)%2===0){ctx.fillStyle='#ffd076';ctx.fillRect(cx-width/2,cy+height-2,1.5,2);ctx.fillRect(cx+width/2-1.5,cy+height-2,1.5,2)}
 }

  vehicleIcons.set(key,icon);
 }
 return vehicleIcons.get(key);
}
function draw(){
 const geo=roadGeometry(),w=geo.width,h=geo.height,dpr=Math.min(devicePixelRatio||1,2),roadW=geo.roadWidth,lw=geo.laneWidth,y=geo.project;
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 const key=geometryKey+'/'+dpr;
 if(key!==sceneryKey){sceneryKey=key;if(!scenery)scenery=document.createElement('canvas');if(scenery.width!==canvas.width||scenery.height!==canvas.height){scenery.width=canvas.width;scenery.height=canvas.height;}const surface=scenery.getContext('2d');surface.setTransform(dpr,0,0,dpr,0,0);paintScenery(surface,geo);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.drawImage(scenery,0,0,w,h);
 for(const r of operations.ramps){
 if(r.mode==='closed'){const p=slipRoadPoint(geo,r,r.x-r.mergeLength+10);ctx.fillStyle='#16242b';ctx.fillRect(p.x-7,p.y-6,14,12);ctx.fillStyle='#ff7768';ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.fillText('×',p.x,p.y+5);}
 }
const work=operations.work;
if(work.status!=='complete'&&sim.elapsed>=work.announceAt){const wy=y(work.x),wx=geo.leftAt(work.x);ctx.fillStyle='#e1bd73';ctx.font='8px sans-serif';ctx.textAlign='left';ctx.fillText('ROADWORKS '+(work.status==='working'?'ACTIVE':'DUE'),wx+geo.roadWidth+10,wy-13);}
if(work.sceneId!=null&&work.status!=='complete'){
 for(const p of roadworkCones(geo,work)){if(p.y<-5||p.y>h+5)continue;ctx.fillStyle='#ff9d43';ctx.beginPath();ctx.moveTo(p.x,p.y-3);ctx.lineTo(p.x-3,p.y+3);ctx.lineTo(p.x+3,p.y+3);ctx.closePath();ctx.fill();ctx.fillStyle='#fff2d3';ctx.fillRect(p.x-1.5,p.y,3,1);}
 if(work.status==='working'){ctx.fillStyle='#e6ef88';ctx.fillRect(geo.laneX(work.x-work.length/2,work.lanes[0])-2,y(work.x-work.length/2),4,5);}
}
const incidentLabels=[],incidentMarkers=[];
const vehicles=[...sim.cars,...operations.ramps.flatMap(r=>r.queue)];
for(const c of placeSprites(vehicles,sim.incidents,{left:geo.leftAt(0),laneWidth:lw,project:y,overview:VIEW_LENGTH===LENGTH,laneX:geo.laneX,angleAt:geo.angleAt,offRampPosition:c=>offRampPoint(geo,operations.ramps[c.offRamp],c.x),rampPosition:c=>slipRoadPoint(geo,operations.ramps[c.onRamp??c.slipRamp],c.x,c)})){
 const {cx,cy,width}=c;const height=c.designHeight;
 if(cy+c.height<0||cy>h)continue;
 if(c.type==='roadworks'||c.type==='police-clearance'){if(!c.bodyIndex)incidentLabels.push(c);continue;}
 const sx=c.width/(c.designWidth??c.width),sy=c.height/height;
 if(Math.abs(c.angle)>.025){
  ctx.save();ctx.translate(cx,cy);ctx.rotate(c.angle);ctx.drawImage(vehicleIcon(c),-7*sx,0,14*sx,(height+2)*sy);ctx.restore();
 }else ctx.drawImage(vehicleIcon(c),cx-7*sx,cy,14*sx,(height+2)*sy);
 if(c.static){incidentMarkers.push(c);if(c.type==='shed-load'){ctx.fillStyle='#e7ad60';ctx.fillRect(cx-4,cy-2,3,3);ctx.fillRect(cx+1,cy+2,3,3);}if(!c.bodyIndex)incidentLabels.push(c);}
}
GANTRIES.forEach((g,gi)=>{const gy=y(g),left=geo.leftAt(g);if(gy<20||gy>h-20)return;ctx.fillStyle=gi===selected?'#bbdf86':'#6e8880';ctx.fillRect(left-12,gy,roadW+24,3);ctx.fillRect(left-12,gy,3,16);ctx.fillRect(left+roadW+9,gy,3,16);ctx.textAlign='left';ctx.font='bold 9px sans-serif';sim.signals[gi].forEach((s,l)=>{const x=left+(l+.5)*lw;ctx.fillStyle='#101e24';ctx.fillRect(x-14,gy-14,28,25);ctx.textAlign='center';ctx.font='bold 13px sans-serif';ctx.fillStyle=s.mode==='closed'?'#ff7768':s.mode==='merge'?'#efc676':'#e4ecdf';if(s.mode.startsWith('merge')){const dir=s.mode==='merge-left'||(s.mode==='merge'&&l===2)?-1:1;ctx.strokeStyle='#f1cc72';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-dir*4,gy+5);ctx.lineTo(x+dir*5,gy-5);ctx.stroke();ctx.beginPath();ctx.moveTo(x+dir*5-dir*6,gy-5);ctx.lineTo(x+dir*5,gy-5);ctx.lineTo(x+dir*5,gy+1);ctx.stroke();}else ctx.fillText(s.mode==='closed'?'×':s.speed,x,gy+3);if(s.mode==='open'){ctx.strokeStyle='#e57869';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(x,gy-2,10,0,Math.PI*2);ctx.stroke()}})});for(const c of incidentLabels){
 let labelY=c.cy;
 for(const g of GANTRIES){const gy=y(g);if(Math.abs(labelY-gy)<32)labelY=gy+36;}
 labelY=Math.max(12,Math.min(h-75,labelY));
 const labelX=geo.leftAt(c.x)+roadW+12;
 ctx.strokeStyle='#ffab85';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(c.cx+5,c.cy+3);ctx.lineTo(labelX-3,labelY+3);ctx.stroke();
 ctx.fillStyle='#ffb291';ctx.font='bold 8px sans-serif';ctx.textAlign='left';ctx.fillText(c.type==='breakdown'?'BREAKDOWN':c.type==='debris'?'DEBRIS':c.type==='shed-load'?'SHED LOAD':c.type==='pile-up'?'PILE-UP':c.type==='roadworks'?'ROADWORKS':c.type==='police-clearance'?'POLICE HOLD':'COLLISION',labelX,labelY);
 ctx.font='8px sans-serif';ctx.fillText(c.lanes?'LANES '+c.lanes.map(l=>l+1).join('&'):'LANE '+(c.lane+1),labelX,labelY+12);
 ctx.fillStyle='#e1c4a3';ctx.font='7px sans-serif';ctx.fillText(c.status==='recovering'?'LOADING':c.status==='recovery-en-route'?'TOW COMING':c.status==='awaiting-recovery'?'TOW CALLED':c.status==='workers-withdrawn'?'WORK PAUSED':'CREWS HERE',labelX,labelY+24);
}
for(const c of incidentMarkers){ctx.strokeStyle='#ffab85';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(c.cx,c.cy+3,7,0,Math.PI*2);ctx.stroke();}
ctx.textAlign='center';ctx.fillStyle='#93b29e';ctx.font='9px sans-serif';ctx.fillText('↑     ↑     ↑',w/2,h-18)}
function updateDashboard(){
 updateInlineReading();updateResponseStatus();
 $('#flow').firstChild.nodeValue=sim.exits.length*60+' ';
 $('#speed').firstChild.nodeValue=Math.round(sim.cars.reduce((a,c)=>a+c.v,0)/Math.max(1,sim.cars.length)/.44704)+' ';
 $('#vehicles').textContent=sim.cars.length;$('#queue').textContent=sim.waiting+' waiting at entry';
 const minutes=480+Math.floor(sim.elapsed/60);$('#time').textContent=String(Math.floor(minutes/60)%24).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
}
let last=performance.now(),accumulator=0,seenEvent=0,lastDashboard=-Infinity;
function frame(now){
 const delta=Math.min((now-last)/1000,.15);last=now;
 if(!paused){
  // Retain 0.1s safety steps; let the simulation clock slow if a phone is busy
  // rather than blocking input with a backlog of catch-up work.
  accumulator=Math.min(accumulator+delta*rate*3,.8);
  const started=performance.now();let steps=0;
  while(accumulator>=.1&&steps<8){sim.step(.1);accumulator-=.1;steps++;if(performance.now()-started>8)break;}
 }
 if(sim.eventId!==seenEvent){seenEvent=sim.eventId;notify(sim.lastEvent)}
 draw();
 if(now-lastDashboard>=200){updateDashboard();lastDashboard=now;}
 if(now-lastDeskUpdate>=500){updateTrafficDesk();updateOperations();lastDeskUpdate=now;}
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
