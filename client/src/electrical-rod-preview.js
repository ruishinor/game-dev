import * as THREE from 'three';
import {createElectricalRod,createElectricalRodVfx} from './electrical-rod.js';
import {createVfx} from './vfx/engine.js';
import {buildTextures} from './vfx/textures.js';
const $=id=>document.getElementById(id), canvas=$('view');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x1d2934);
const camera=new THREE.PerspectiveCamera(39,1,.05,30);
const key=new THREE.DirectionalLight(0xe1f0ff,3.2);key.position.set(2,4,3);scene.add(key);
const rim=new THREE.DirectionalLight(0x719dcb,2.6);rim.position.set(-3,2,-2);scene.add(rim);
scene.add(new THREE.HemisphereLight(0xcadff1,0x39434b,1.6));
const pivot=new THREE.Group();pivot.position.y=1.03;scene.add(pivot);
const rod=createElectricalRod({independentEmission:true});pivot.add(rod.group);
const grid=new THREE.GridHelper(4,20,0x455766,0x303c46);scene.add(grid);
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const textures=buildTextures(THREE);
const vfx=createVfx(THREE,scene,{textures,groundHeight:()=>0,quality:2,reducedMotion:motion.matches});
const rodVfx=createElectricalRodVfx(rod,vfx);
let mode='dual',energized=true,calm=motion.matches,attack=0,phase=0,last=performance.now();
let az=.43,el=.18,distance=3.15,drag=null,loop=false,repeat=0;
function modeTo(m){mode=m;rod.setMode(m);$('split').setAttribute('aria-pressed',String(m==='dual'));$('join').setAttribute('aria-pressed',String(m==='rod'));}
$('split').onclick=()=>modeTo('dual');$('join').onclick=()=>modeTo('rod');
function startStrike(){if(!attack&&Math.abs(rod.progress-(mode==='rod'?1:0))<.001){attack=1;phase=0;if(energized)rodVfx.charge();}}
$('strike').onclick=startStrike;
$('charge').onclick=()=>{if(energized)rodVfx.charge();};
$('impact').onclick=()=>{if(energized)rodVfx.impact(rod.anchor(0,'Tip'),{ground:new THREE.Vector3(0,0,0)});};
$('loop').onclick=()=>{loop=!loop;repeat=0;$('loop').setAttribute('aria-pressed',String(loop));};
$('quality').onchange=()=>vfx.setQuality(Number($('quality').value));
$('intensity').oninput=()=>comfort();
$('energy').onclick=()=>{energized=!energized;$('energy').setAttribute('aria-pressed',String(energized));};
function comfort(){vfx.reducedMotion=calm||motion.matches;vfx.setIntensity(calm?Math.min(.4,Number($('intensity').value)/100):Number($('intensity').value)/100,calm);$('calm').setAttribute('aria-pressed',String(calm));}
$('calm').onclick=()=>{calm=!calm;comfort();};motion.addEventListener?.('change',comfort);comfort();
canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag)return;az-=(e.clientX-drag[0])*.009;el=Math.max(-.8,Math.min(.8,el+(e.clientY-drag[1])*.009));drag=[e.clientX,e.clientY];});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{drag=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(1.4,Math.min(5,distance+e.deltaY*.003));},{passive:false});
function frame(now){
 const dt=Math.max(0,Math.min(.05,(now-last)/1000));last=now;
 const reduced=vfx.reducedMotion;
 if(loop){repeat-=dt;if(repeat<=0){startStrike();repeat=1.8;}}
 const before=phase;
 if(attack){phase=Math.min(1,phase+dt/(mode==='rod'?.78:.56));if(phase===1)attack=0;}
 const active=attack?Math.sin(phase*Math.PI):0;
 // Showcase study only; the future humanoid clips must follow hand anchors.
 const swing=reduced?0:(mode==='rod'?1.08:.64)*Math.sin(phase*Math.PI*2)*active;
 pivot.rotation.set(-.11*active,mode==='rod'?swing*.65:0,swing);
 rod.update(dt,{reducedMotion:reduced,energized,activity:active});
 if(energized&&before<.44&&phase>=.44){rodVfx.impact(rod.anchor(0,'Tip'),{ground:new THREE.Vector3(0,0,0)});}
 rodVfx.update(dt,{energized,activity:active});vfx.update(dt);
 const w=canvas.clientWidth,h=canvas.clientHeight;if(w&&h){
  if(renderer.domElement.width!==Math.round(w*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  camera.position.set(Math.sin(az)*Math.cos(el)*distance,1.12+Math.sin(el)*distance,Math.cos(az)*Math.cos(el)*distance);camera.lookAt(0,1.12,0);
  renderer.render(scene,camera);
 }
 $('state').textContent=(rod.progress===0?'Separated':rod.progress===1?'Connected':'Transforming')+' · '+(energized?'energized':'unpowered')+' · '+renderer.info.render.triangles.toLocaleString()+' rendered triangles';
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
