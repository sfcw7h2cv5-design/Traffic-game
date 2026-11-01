import {Simulation,LENGTH,GANTRIES} from './model.js?v=4';
const $=s=>document.querySelector(s), sim=new Simulation();window.sim=sim;let selected=1,rate=1,paused=false;const canvas=$('#road'),ctx=canvas.getContext('2d');
const descriptions={commute:'Steady arrivals with a mix of cars and HGVs. A good place to learn the network.',busy:'Peak demand is arriving. Smooth speeds and use every available lane to keep queues moving.',incident:'Breakdowns and other incidents arrive automatically. Watch the traffic desk and protect the queue with upstream signals.',rain:'Wet conditions increase following distances and reduce desired speeds. Try a consistent lower limit.',reckless:'Some drivers leave short gaps and exceed posted limits. Watch for waves of braking.'};
function notify(t){$('#event').textContent=t}
function renderControls(){ $('#previousGantry').disabled=selected===0;$('#nextGantry').disabled=selected===GANTRIES.length-1;document.querySelectorAll('[data-gantry]').forEach(b=>{b.classList.toggle('active',+b.dataset.gantry===selected);b.setAttribute('aria-expanded',String($('#signalDialog').open&&+b.dataset.gantry===selected))}); $('#selected').textContent=`Gantry 0${selected+1}`;$('#distance').textContent=`${(GANTRIES[selected]/1000).toFixed(2)} km`;$('#lanes').innerHTML=sim.signals[selected].map((s,l)=>`<div class="lane"><label>LANE ${l+1}</label><div class="signal ${s.mode==='closed'?'closed':s.mode==='merge'?'merge':''}">${s.mode==='open'?`<span>${s.speed}</span>`:s.mode==='closed'?'×':l===2?'↖':'↗'}</div><select aria-label="Lane ${l+1} signal" data-lane="${l}" data-key="mode"><option value="open" ${s.mode==='open'?'selected':''}>Open</option><option value="merge" ${s.mode==='merge'?'selected':''}>Merge ${l===2?'left':'right'}</option><option value="closed" ${s.mode==='closed'?'selected':''}>Closed ×</option></select><select aria-label="Lane ${l+1} speed limit" data-lane="${l}" data-key="speed">${[20,30,40,50,60,70].map(v=>`<option ${v===s.speed?'selected':''} value="${v}">${v} mph</option>`).join('')}</select><div class="lane-actual" id="actual-${l}">Actual: — mph</div></div>`).join('')}
$('#lanes').onchange=e=>{const {lane,key}=e.target.dataset;sim.signals[selected][lane][key]=key==='speed'?+e.target.value:e.target.value;notify(`Gantry 0${selected+1} · Lane ${+lane+1} signal updated.`);renderControls()};$('#allSpeeds').innerHTML=[30,40,50,60,70].map(n=>`<button data-speed="${n}">${n}</button>`).join('');$('#allSpeeds').onclick=e=>{if(e.target.dataset.speed){sim.signals[selected].forEach(s=>s.speed=+e.target.dataset.speed);renderControls();notify(`Gantry 0${selected+1} · All lanes set to ${e.target.dataset.speed} mph.`)}};
$('#pause').onclick=()=>{paused=!paused;$('#pause').textContent=paused?'▶':'❚❚';$('#pause').setAttribute('aria-label',paused?'Resume simulation':'Pause simulation')};$('#rate').onclick=()=>{rate=rate===1?2:rate===2?4:1;$('#rate').textContent=rate+'×'};$('#scenario').onchange=e=>{sim.scenario=e.target.value;$('#scenarioText').textContent=descriptions[sim.scenario];if(sim.scenario==='incident')sim.nextIncident=Math.min(sim.nextIncident,sim.elapsed+8+Math.random()*10);notify('Conditions changed. Watch for automatic incident reports.')};$('#clear').onclick=()=>{sim.incidents=[];notify('Incidents cleared. Reopen lanes when you are ready.')};$('#help').onclick=()=>$('#guide').showModal();$('#closeHelp').onclick=$('#begin').onclick=()=>$('#guide').close();
const signalDialog=$('#signalDialog');
let openedFrom=null;
$('#gantryTargets').innerHTML=GANTRIES.map((g,i)=>`<button class="gantry-hotspot" data-gantry="${i}" aria-label="Control Gantry 0${i+1}" aria-haspopup="dialog" aria-controls="signalDialog" aria-expanded="false"><span>G0${i+1} · EDIT</span></button>`).join('');
function positionGantryTargets(){
 const height=canvas.clientHeight;
 document.querySelectorAll('[data-gantry]').forEach(b=>{
  b.style.top=(height-46-GANTRIES[+b.dataset.gantry]*(height-76)/LENGTH)+'px';
 });
}
new ResizeObserver(positionGantryTargets).observe(canvas);
positionGantryTargets();
$('#gantryTargets').onclick=e=>{
 const button=e.target.closest('[data-gantry]');if(!button)return;
 openedFrom=button;selected=+button.dataset.gantry;
 signalDialog.showModal();document.documentElement.classList.add('signals-open');
 renderControls();updateLaneSpeeds();
};
$('#closeSignals').onclick=$('#doneSignals').onclick=()=>signalDialog.close();
signalDialog.addEventListener('close',()=>{
 document.documentElement.classList.remove('signals-open');renderControls();
 openedFrom?.focus({preventScroll:true});
});
signalDialog.addEventListener('click',e=>{
 if(e.target!==signalDialog)return;
 const r=signalDialog.getBoundingClientRect();
 if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)signalDialog.close();
});
$('#previousGantry').onclick=()=>{if(selected>0){selected--;renderControls();updateLaneSpeeds()}};
$('#nextGantry').onclick=()=>{if(selected<GANTRIES.length-1){selected++;renderControls();updateLaneSpeeds()}};
function draw(){const w=canvas.clientWidth,h=canvas.clientHeight,dpr=devicePixelRatio||1;if(canvas.width!==w*dpr||canvas.height!==h*dpr){canvas.width=w*dpr;canvas.height=h*dpr}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#1d3437';ctx.fillRect(0,0,w,h);const roadW=Math.min(w*.48,250),left=(w-roadW)/2,lw=roadW/3,top=30,bottom=h-46,scale=(bottom-top)/LENGTH,y=x=>bottom-x*scale;ctx.fillStyle='#2c3c40';ctx.fillRect(left-15,0,roadW+30,h);ctx.fillStyle='#35464a';ctx.fillRect(left,0,roadW,h);ctx.strokeStyle='#9eafa5';ctx.lineWidth=1;for(const x of [left,left+roadW]){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}ctx.setLineDash([8,12]);ctx.strokeStyle='#82938b88';for(let l=1;l<3;l++){ctx.beginPath();ctx.moveTo(left+l*lw,0);ctx.lineTo(left+l*lw,h);ctx.stroke()}ctx.setLineDash([]);
ctx.font='9px sans-serif';ctx.fillStyle='#7d9990';ctx.textAlign='left';for(let km=0;km<=LENGTH/1000;km++){ctx.fillText(`${km}.0 km`,15,y(km*1000));ctx.fillRect(left-25,y(km*1000),8,1)}ctx.save();ctx.translate(w-20,h/2);ctx.rotate(-Math.PI/2);ctx.fillStyle='#79968c';ctx.font='9px sans-serif';ctx.fillText('NORTHBOUND  →',-55,0);ctx.restore();
// Compact vehicle symbols reduce the apparent bumper-to-bumper spacing.
for(const c of sim.cars){const cx=left+(c.visualLane+.5)*lw,cy=y(c.x);
const width=c.truck?8:4.5,height=c.truck?13:5.5;
ctx.fillStyle=c.truck?'#e7dfb5':c.braking?'#e7b66f':['#c6ddd1','#7ba9ad','#a9c998','#d9e2d5'][c.id%4];
ctx.beginPath();ctx.roundRect(cx-width/2,cy,width,height,1);ctx.fill();
ctx.fillStyle=c.truck?'#6fb5bf':'#354b51';ctx.fillRect(cx-width/2+.7,cy+1,width-1.4,c.truck?3:1.2);
if(c.truck){ctx.fillStyle='#9b926e';ctx.fillRect(cx-width/2+1,cy+5,width-2,1);ctx.fillStyle='#12262d';ctx.fillRect(cx-width/2-1,cy+8,1,3);ctx.fillRect(cx+width/2,cy+8,1,3)}
if(c.braking){ctx.fillStyle='#ff7363';ctx.fillRect(cx-width/2,cy+height-1,1.5,1.5);ctx.fillRect(cx+width/2-1.5,cy+height-1,1.5,1.5)}}
for(const i of sim.incidents){const cx=left+(i.lane+.5)*lw,cy=y(i.x);
ctx.fillStyle='#f37f60';ctx.beginPath();ctx.roundRect(cx-4,cy,8,i.truck?14:9,2);ctx.fill();ctx.fillStyle='#273f46';ctx.fillRect(cx-3,cy+1,6,2);
// Flashing hazards mark the actual stopped vehicle, not just a warning icon.
if(Math.floor(sim.elapsed*2)%2===0){ctx.fillStyle='#ffd076';ctx.fillRect(cx-7,cy+1,3,3);ctx.fillRect(cx+4,cy+1,3,3);ctx.fillRect(cx-7,cy+7,3,3);ctx.fillRect(cx+4,cy+7,3,3)}
ctx.strokeStyle='#f3ac76';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(cx,cy+18);ctx.lineTo(cx-4,cy+25);ctx.lineTo(cx+4,cy+25);ctx.closePath();ctx.stroke();
ctx.fillStyle='#efb8a0';ctx.font='8px sans-serif';ctx.textAlign='left';ctx.fillText(i.type==='breakdown'?'BREAKDOWN':i.type==='debris'?'DEBRIS':'COLLISION',left+roadW+15,cy+3);ctx.fillText('LANE '+(i.lane+1),left+roadW+15,cy+14);ctx.fillText('RECOVERY '+Math.max(0,Math.ceil((i.clearsAt-sim.elapsed)/(rate*3)))+'s',left+roadW+15,cy+25)}
GANTRIES.forEach((g,gi)=>{const gy=y(g);ctx.fillStyle=gi===selected?'#bbdf86':'#6e8880';ctx.fillRect(left-12,gy,roadW+24,3);ctx.fillRect(left-12,gy,3,16);ctx.fillRect(left+roadW+9,gy,3,16);ctx.textAlign='left';ctx.font='bold 9px sans-serif';ctx.fillText(`G0${gi+1}`,left-48,gy+4);sim.signals[gi].forEach((s,l)=>{const x=left+(l+.5)*lw;ctx.fillStyle='#101e24';ctx.fillRect(x-14,gy-14,28,25);ctx.textAlign='center';ctx.font='bold 13px sans-serif';ctx.fillStyle=s.mode==='closed'?'#ff7768':s.mode==='merge'?'#efc676':'#e4ecdf';ctx.fillText(s.mode==='closed'?'×':s.mode==='merge'?l===2?'↖':'↗':s.speed,x,gy+3);if(s.mode==='open'){ctx.strokeStyle='#e57869';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(x,gy-2,10,0,Math.PI*2);ctx.stroke()}})});ctx.textAlign='center';ctx.fillStyle='#93b29e';ctx.font='9px sans-serif';ctx.fillText('↑     ↑     ↑',w/2,h-18)}
function updateLaneSpeeds(){
 const start=GANTRIES[selected],end=GANTRIES[selected+1]??LENGTH;
 const section=sim.cars.filter(c=>c.x>=start&&c.x<end);
 for(let l=0;l<3;l++){
  const cars=section.filter(c=>c.lane===l), el=document.querySelector('#actual-'+l);
  if(el)el.textContent=cars.length?'Actual: '+Math.round(cars.reduce((n,c)=>n+c.v,0)/cars.length/.44704)+' mph':'Actual: no traffic';
 }
}
let last=performance.now(),accumulator=0,seenEvent=0;function frame(now){const delta=Math.min((now-last)/1000,.15);last=now;if(!paused){accumulator+=delta*rate*3;while(accumulator>=.1){sim.step(.1);accumulator-=.1}}if(sim.eventId!==seenEvent){seenEvent=sim.eventId;notify(sim.lastEvent)}draw();updateLaneSpeeds();$('#flow').innerHTML=`${sim.exits.length*60} <small>veh/h</small>`;$('#speed').innerHTML=`${Math.round(sim.cars.reduce((a,c)=>a+c.v,0)/Math.max(1,sim.cars.length)/.44704)} <small>mph</small>`;$('#vehicles').textContent=sim.cars.length;$('#queue').textContent=`${sim.waiting} waiting at entry`;const minutes=480+Math.floor(sim.elapsed/60);$('#time').textContent=`${String(Math.floor(minutes/60)%24).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;requestAnimationFrame(frame)}renderControls();requestAnimationFrame(frame);
