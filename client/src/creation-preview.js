// Character creation uses exactly the gameplay model factory and appearance
// metadata. Preview state is presentation-only, never character authority.
import * as THREE from '/vendor/three/three.module.js';
import {createModel} from './characters.js';

export function createCreationPreview({root,assets,useGlb,motionPreference,getMeta}){
 const canvas=root.querySelector('canvas'),status=root.querySelector('[data-preview-status]');
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.01,100);
 scene.background=new THREE.Color(0x132029);
 scene.add(new THREE.HemisphereLight(0xd4efff,0x3a352f,2.4));
 const key=new THREE.DirectionalLight(0xffeee0,3.2);key.position.set(3,5,4);scene.add(key);
 const rim=new THREE.DirectionalLight(0x91cfdf,1.8);rim.position.set(-3,2,-3);scene.add(rim);
 let renderer=null,model=null,keyState='',failed=false,visible=false;
 let yaw=.36,pitch=.10,zoom=1,mode='body',drag=null,lastDraw=-Infinity,dirty=true,center=new THREE.Vector3(),height=2,width=1;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const release=()=>{if(model){scene.remove(model.group);model.dispose?.();model=null;}keyState='';delete root.dataset.model;delete root.dataset.appearance;};
 const setMode=next=>{mode=next;zoom=1;dirty=true;root.dataset.mode=next;for(const b of root.querySelectorAll('[data-preview-mode]'))b.setAttribute('aria-pressed',String(b.dataset.previewMode===next));};
 const reset=()=>{yaw=.36;pitch=.10;setMode('body');root.dataset.yaw=String(yaw);root.dataset.zoom=String(zoom);};
 const rotate=delta=>{yaw+=delta;root.dataset.yaw=String(yaw);dirty=true;};
 const magnify=delta=>{zoom=clamp(zoom*Math.exp(delta),.65,2.4);root.dataset.zoom=String(zoom);dirty=true;};
 const observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);if(!visible)release();else dirty=true;},{threshold:0.05});
 observer.observe(canvas);
 for(const b of root.querySelectorAll('[data-preview-mode]'))b.addEventListener('click',()=>setMode(b.dataset.previewMode));
 root.querySelector('[data-preview-reset]').addEventListener('click',reset);
 root.querySelector('[data-preview-left]').addEventListener('click',()=>rotate(-.3));
 root.querySelector('[data-preview-right]').addEventListener('click',()=>rotate(.3));
 root.querySelector('[data-preview-in]').addEventListener('click',()=>magnify(.2));
 root.querySelector('[data-preview-out]').addEventListener('click',()=>magnify(-.2));
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});e.preventDefault();});
 canvas.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;rotate((drag.x-e.clientX)*.012);pitch=clamp(pitch+(e.clientY-drag.y)*.006,-.55,.65);drag.x=e.clientX;drag.y=e.clientY;});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(drag?.id===e.pointerId)drag=null;});
 canvas.addEventListener('wheel',e=>{if(document.activeElement!==canvas)return;e.preventDefault();magnify(-e.deltaY*.001);},{passive:false});
 canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Home'].includes(e.key))return;e.preventDefault();e.stopPropagation();if(e.key==='ArrowLeft')rotate(-.24);else if(e.key==='ArrowRight')rotate(.24);else if(e.key==='ArrowUp'||e.key==='+')magnify(.18);else if(e.key==='ArrowDown'||e.key==='-')magnify(-.18);else reset();});
 reset();
 const active=()=>visible&&!failed&&!document.hidden&&canvas.getClientRects().length>0;
 function update(now,dt){
  if(!active())return false;
  const meta=getMeta(),glb=useGlb(meta),next=JSON.stringify([meta.c,meta.a,meta.ap,meta.n,glb]);
  const w=Math.max(1,Math.round(canvas.clientWidth)),h=Math.max(1,Math.round(canvas.clientHeight));
  if(!dirty&&next===keyState&&now-lastDraw<1000/15&&renderer)return true;
  try{
   if(!renderer){
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
   }
   if(next!==keyState){
    release();model=createModel(assets,meta,glb);scene.add(model.group);keyState=next;
    model.update(.08,{t:1,speed:0,dead:false,attack:0,cast:0,hit:0,air:false,mode:'triage',act:'idle',casting:false,combat:false,charge:0,fwd:1,interval:0});
    model.group.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model.group),size=bounds.getSize(new THREE.Vector3());
    if(!Number.isFinite(size.y)||size.y<=0)throw Error('Invalid preview bounds');
    bounds.getCenter(center);height=size.y;width=Math.max(size.x,size.z);
    root.dataset.model=model.kind;root.dataset.appearance=meta.ap;
    status.textContent=model.kind==='glb'?'Live gameplay character':'Simplified gameplay asset; full model unavailable';
   }
   const d=renderer.getSize(new THREE.Vector2());
   if(d.x!==w||d.y!==h)renderer.setSize(w,h,false);
   camera.aspect=w/h;
   const focus=center.clone();if(mode==='face')focus.y+=height*.34;
   const framing=mode==='face'?height*.31:Math.max(height*1.16,width*1.18/camera.aspect);
   const distance=framing/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))/zoom;
   camera.position.copy(focus).add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(distance));camera.lookAt(focus);camera.updateProjectionMatrix();
   const step=Number.isFinite(lastDraw)?clamp((now-lastDraw)/1000,0,.1):dt;
   if(!motionPreference.matches)model.update(step,{t:now/1000,speed:0,dead:false,attack:0,cast:0,hit:0,air:false,mode:'triage',act:'idle',casting:false,combat:false,charge:0,fwd:1,interval:0});
   renderer.render(scene,camera);lastDraw=now;dirty=false;return true;
  }catch(err){
   release();renderer?.dispose();renderer=null;failed=true;
   status.textContent='3D preview unavailable on this device. Your appearance selections still apply.';
   return false;
  }
 }
 return {update,release,active};
}
