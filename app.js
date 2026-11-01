import {Simulation,LENGTH,GANTRIES} from './model.js?v=6';
import {createSpriteLayout} from './display.js?v=6';
const placeSprites=createSpriteLayout();
const $=s=>document.querySelector(s),sim=new Simulation();window.sim=sim;
let selected=1,laneScope='all',rate=1,paused=false,editorOpener=null;
const canvas=$('#road'),ctx=canvas.getContext('2d'),editor=$('#inlineSignals');
const descriptions={commute:'Steady arrivals with a mix of cars and HGVs.',busy:'Peak demand. Protect queue tails with upstream limits.',incident:'Random incidents need protection and vehicle recovery.',rain:'Wet conditions increase following distances.',reckless:'Watch for unpredictable drivers and braking waves.'};
function notify(text){$('#event').textContent=text}
function closeEditor(){editor.hidden=true;editorOpener?.setAttribute('aria-expanded','false')}
function roadGeometry(){const w=canvas.clientWidth,h=canvas.clientHeight,rw=Math.min(w*.48,250);return {w,h,rw,left:(w-rw)/2,lw:rw/3,y:g=>h-46-g*(h-76)/LENGTH}}
function positionTargets(){const {left,lw,y}=roadGeometry();document.querySelectorAll('[data-gantry]').forEach(b=>{const lane=b.dataset.lane;b.style.left=(lane==='all'?left-54:left+(+lane)*lw)+'px';b.style.width=(lane==='all'?44:lw)+'px';b.style.top=y(GANTRIES[+b.dataset.gantry])+'px'});if(!editor.hidden)positionEditor()}
function positionEditor(){const {h,y}=roadGeometry();const gy=y(GANTRIES[selected]),eh=editor.offsetHeight;editor.style.top=Math.max(8,Math.min(h-eh-40,gy+(gy<h/2?27:-eh-27)))+'px'}
$('#gantryTargets').innerHTML=GANTRIES.map((g,i)=>['all',0,1,2].map(l=>`<button class="road-sign-target ${l==='all'?'gantry-side':''}" data-gantry="${i}" data-lane="${l}" aria-label="Gantry 0${i+1} ${l==='all'?'all lanes':'lane '+(+l+1)}" aria-expanded="false" aria-controls="inlineSignals">${l==='all'?`G0${i+1}<small>ALL</small>`:''}</button>`).join('')).join('');
function renderEditor(){
 $('#inlineTitle').textContent=`G0${selected+1} · ${laneScope==='all'?'All lanes':'Lane '+(+laneScope+1)}`;
 const signals=laneScope==='all'?sim.signals[selected]:[sim.signals[selected][+laneScope]];
 $('#inlineSpeeds').innerHTML=[20,30,40,50,60,70].map(v=>`<button data-speed="${v}" aria-label="${v} mph" aria-pressed="${signals.every(s=>s.speed===v)}">${v}</button>`).join('');
 $('#inlineModes').innerHTML=[['open','Open'],['merge','Merge '+(laneScope==='2'?'↖':'↗')],['closed','Close ×']].map(([mode,label])=>`<button data-mode="${mode}" aria-pressed="${signals.every(s=>s.mode===mode)}">${label}</button>`).join('');
 updateInlineReading();positionEditor();
}
$('#gantryTargets').onclick=e=>{const b=e.target.closest('[data-gantry]');if(!b)return;closeEditor();editorOpener=b;selected=+b.dataset.gantry;laneScope=b.dataset.lane;editor.hidden=false;b.setAttribute('aria-expanded','true');renderEditor()};
$('#inlineSpeeds').onclick=e=>{const b=e.target.closest('[data-speed]');if(!b)return;const lanes=laneScope==='all'?[0,1,2]:[+laneScope];lanes.forEach(l=>sim.signals[selected][l].speed=+b.dataset.speed);renderEditor()};
$('#inlineModes').onclick=e=>{const b=e.target.closest('[data-mode]');if(!b)return;(laneScope==='all'?[0,1,2]:[+laneScope]).forEach(l=>sim.signals[selected][l].mode=b.dataset.mode);renderEditor()};
$('#closeInline').onclick=closeEditor;
editor.addEventListener('click',e=>e.stopPropagation());
$('.mapwrap').addEventListener('click',e=>{if(!e.target.closest('#inlineSignals')&&!e.target.closest('[data-gantry]'))closeEditor()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeEditor()});
new ResizeObserver(positionTargets).observe(canvas);positionTargets();
function updateInlineReading(){if(editor.hidden)return;const cars=sim.cars.filter(c=>c.x>=GANTRIES[selected]&&c.x<(GANTRIES[selected+1]??LENGTH)&&(laneScope==='all'?c.lane>=0:c.lane===+laneScope));$('#inlineActual').textContent=cars.length?'Actual '+Math.round(cars.reduce((n,c)=>n+c.v,0)/cars.length/.44704)+' mph · changes apply downstream':'No traffic in this section'}
$('#pause').onclick=()=>{paused=!paused;$('#pause').textContent=paused?'▶':'❚❚';$('#pause').setAttribute('aria-label',paused?'Resume simulation':'Pause simulation')};
$('#rate').onclick=()=>{rate=rate===1?2:rate===2?4:1;$('#rate').textContent=rate+'×'};
$('#scenario').onchange=e=>{sim.scenario=e.target.value;$('#scenarioText').textContent=descriptions[sim.scenario];if(sim.scenario==='incident')sim.nextIncident=Math.min(sim.nextIncident,sim.elapsed+10)};
$('#help').onclick=()=>$('#guide').showModal();$('#closeHelp').onclick=$('#begin').onclick=()=>$('#guide').close();
// iPhone permits audio only after a deliberate user gesture.
let audio=null,osc=null,gain=null,sound=false;
$('#sound').onclick=async()=>{try{if(!audio){audio=new(window.AudioContext||window.webkitAudioContext)();osc=audio.createOscillator();gain=audio.createGain();gain.gain.value=0;osc.type='sine';osc.connect(gain);gain.connect(audio.destination);osc.start()}await audio.resume();sound=!sound;$('#sound').textContent=sound?'Sound on':'Sound off';$('#sound').setAttribute('aria-pressed',String(sound))}catch{notify('Audio unavailable in this browser. Blue lights remain visible.')}};
function updateSiren(){if(!audio)return;const active=sound&&!paused&&!document.hidden&&sim.cars.some(c=>c.emergency&&c.x>0&&c.x<LENGTH);gain.gain.setTargetAtTime(active?.035:0,audio.currentTime,.08);if(active)osc.frequency.setTargetAtTime(650+330*(.5+.5*Math.sin(audio.currentTime*5)),audio.currentTime,.05)}
document.addEventListener('visibilitychange',()=>{if(gain&&document.hidden)gain.gain.setTargetAtTime(0,audio.currentTime,.02)});
function draw(){const w=canvas.clientWidth,h=canvas.clientHeight,dpr=devicePixelRatio||1;if(canvas.width!==w*dpr||canvas.height!==h*dpr){canvas.width=w*dpr;canvas.height=h*dpr}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#1d3437';ctx.fillRect(0,0,w,h);const roadW=Math.min(w*.48,250),left=(w-roadW)/2,lw=roadW/3,top=30,bottom=h-46,scale=(bottom-top)/LENGTH,y=x=>bottom-x*scale;ctx.fillStyle='#2c3c40';ctx.fillRect(left-15,0,roadW+30,h);ctx.fillStyle='#35464a';ctx.fillRect(left,0,roadW,h);ctx.strokeStyle='#9eafa5';ctx.lineWidth=1;for(const x of [left,left+roadW]){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}ctx.setLineDash([8,12]);ctx.strokeStyle='#82938b88';for(let l=1;l<3;l++){ctx.beginPath();ctx.moveTo(left+l*lw,0);ctx.lineTo(left+l*lw,h);ctx.stroke()}ctx.setLineDash([]);
ctx.font='9px sans-serif';ctx.fillStyle='#7d9990';ctx.textAlign='left';for(let km=0;km<=LENGTH/1000;km++){ctx.fillText(`${km}.0 km`,15,y(km*1000));ctx.fillRect(left-25,y(km*1000),8,1)}ctx.save();ctx.translate(w-20,h/2);ctx.rotate(-Math.PI/2);ctx.fillStyle='#79968c';ctx.font='9px sans-serif';ctx.fillText('NORTHBOUND  →',-55,0);ctx.restore();
// Vehicle symbols are enlarged for readability. Stack their display bounds
// upstream in dense queues so enlarged symbols never cover one another.
for(const c of placeSprites(sim.cars,sim.incidents,{left,laneWidth:lw,project:y})){
 const {cx,cy,width,height}=c;
 ctx.fillStyle=c.static?'#ef9476':c.kind==='police'?'#f2f2dd':c.kind==='ambulance'?'#edee75':c.kind==='recovery'?'#f5b85a':c.truck?'#e7dfb5':c.braking?'#e7b66f':['#c6ddd1','#7ba9ad','#a9c998','#d9e2d5'][c.id%4];
 ctx.beginPath();ctx.roundRect(cx-width/2,cy,width,height,1);ctx.fill();ctx.fillStyle='#385a63';ctx.fillRect(cx-width/2+.6,cy+1,width-1.2,2);
 if(c.kind==='ambulance'||c.kind==='police'){ctx.fillStyle='#76a85c';ctx.fillRect(cx-width/2,cy+4,width,2);ctx.fillStyle=Math.floor(sim.elapsed*7)%2?'#45c5ff':'#e5faff';ctx.fillRect(cx-width/2-1,cy+2,3,2);ctx.fillRect(cx+width/2-2,cy+2,3,2)}
 if(c.kind==='recovery'){ctx.fillStyle='#fff3ab';ctx.fillRect(cx-4,cy+3,8,2);if(c.towing){ctx.fillStyle='#df8d72';ctx.fillRect(cx-2.5,cy+12,5,7)}}
 if(c.truck){ctx.fillStyle='#8c9571';ctx.fillRect(cx-width/2+1,cy+5,width-2,1)}
 if(c.static){if(Math.floor(sim.elapsed*2)%2===0){ctx.fillStyle='#ffd076';ctx.fillRect(cx-4,cy+height-2,2,2);ctx.fillRect(cx+2,cy+height-2,2,2)}
 ctx.fillStyle='#efb8a0';ctx.font='8px sans-serif';ctx.textAlign='left';ctx.fillText(c.type.toUpperCase(),left+roadW+15,cy+3);
 const status=c.status==='awaiting-recovery'?'AWAITING TOW':c.status==='recovery-en-route'?'TOW EN ROUTE':c.status==='recovering'?'LOADING VEHICLE':'CREWS WORKING';ctx.fillText(status,left+roadW+15,cy+14)}
}
GANTRIES.forEach((g,gi)=>{const gy=y(g);ctx.fillStyle=gi===selected?'#bbdf86':'#6e8880';ctx.fillRect(left-12,gy,roadW+24,3);ctx.fillRect(left-12,gy,3,16);ctx.fillRect(left+roadW+9,gy,3,16);ctx.textAlign='left';ctx.font='bold 9px sans-serif';sim.signals[gi].forEach((s,l)=>{const x=left+(l+.5)*lw;ctx.fillStyle='#101e24';ctx.fillRect(x-14,gy-14,28,25);ctx.textAlign='center';ctx.font='bold 13px sans-serif';ctx.fillStyle=s.mode==='closed'?'#ff7768':s.mode==='merge'?'#efc676':'#e4ecdf';ctx.fillText(s.mode==='closed'?'×':s.mode==='merge'?l===2?'↖':'↗':s.speed,x,gy+3);if(s.mode==='open'){ctx.strokeStyle='#e57869';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(x,gy-2,10,0,Math.PI*2);ctx.stroke()}})});ctx.textAlign='center';ctx.fillStyle='#93b29e';ctx.font='9px sans-serif';ctx.fillText('↑     ↑     ↑',w/2,h-18)}
let last=performance.now(),accumulator=0,seenEvent=0;function frame(now){const delta=Math.min((now-last)/1000,.15);last=now;if(!paused){accumulator+=delta*rate*3;while(accumulator>=.1){sim.step(.1);accumulator-=.1}}if(sim.eventId!==seenEvent){seenEvent=sim.eventId;notify(sim.lastEvent)}draw();updateInlineReading();updateSiren();$('#flow').innerHTML=`${sim.exits.length*60} <small>veh/h</small>`;$('#speed').innerHTML=`${Math.round(sim.cars.reduce((a,c)=>a+c.v,0)/Math.max(1,sim.cars.length)/.44704)} <small>mph</small>`;$('#vehicles').textContent=sim.cars.length;$('#queue').textContent=`${sim.waiting} waiting at entry`;const minutes=480+Math.floor(sim.elapsed/60);$('#time').textContent=`${String(Math.floor(minutes/60)%24).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;requestAnimationFrame(frame)}requestAnimationFrame(frame);
