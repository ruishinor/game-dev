// Character creation uses exactly the gameplay model factory and appearance
// metadata. Preview state is presentation-only, never character authority.
import * as THREE from '/vendor/three/three.module.js';
import {createModel} from './characters.js';
import {encodeAppearance, FRAMES, normalizeAppearance} from '../../shared/appearance.js';

export function createCreationPreview({root,assets,useGlb,motionPreference,getMeta,selectFrame,variant='creation'}){
 const canvas=root.querySelector('canvas'),status=root.querySelector('[data-preview-status]');
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.01,100);
 scene.background=new THREE.Color(0x132029);
 scene.add(new THREE.HemisphereLight(0xd4efff,0x3a352f,2.4));
 if(variant==='selection'){
  // A small original architectural presentation stage, never the world or an Expanse asset.
  scene.background=new THREE.Color(0x0a1016);
  scene.fog=new THREE.Fog(0x0a1016,9,22);
  const stone=new THREE.MeshStandardMaterial({color:0x3f4c50,roughness:.85,metalness:.15});
  const bronze=new THREE.MeshStandardMaterial({color:0x82775e,roughness:.65,metalness:.55});
  const base=new THREE.Mesh(new THREE.CylinderGeometry(2.8,3.1,.18,48),stone);
  base.position.y=-.17;scene.add(base);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(2.5,.035,8,72),bronze);
  ring.rotation.x=-Math.PI/2;ring.position.y=-.067;scene.add(ring);
  for(const side of [-1,1]){
   const monolith=new THREE.Mesh(new THREE.BoxGeometry(.65,4.6,.75),stone);
   monolith.position.set(side*2.4,2,-3);monolith.rotation.z=side*.065;scene.add(monolith);
   const inlay=new THREE.Mesh(new THREE.BoxGeometry(.07,3.2,.04),bronze);
   inlay.position.set(side*2.4,2,-2.59);scene.add(inlay);
  }
  const lintel=new THREE.Mesh(new THREE.BoxGeometry(5.7,.55,1.0),stone);
  lintel.position.set(0,4.55,-3);scene.add(lintel);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(1.4,.025,8,72),bronze);
  halo.position.set(0,2.25,-2.85);scene.add(halo);
  const atmosphere=new THREE.PointLight(0xc7b6a0,.8,10);atmosphere.position.set(0,3.8,-1.9);scene.add(atmosphere);
 }

 const key=new THREE.DirectionalLight(0xffeee0,3.2);key.position.set(3,5,4);scene.add(key);
 const rim=new THREE.DirectionalLight(0x91cfdf,1.8);rim.position.set(-3,2,-3);scene.add(rim);
 let renderer=null,models=[],keyState='',failed=false,visible=false;
 let yaw=.36,pitch=.10,zoom=1,mode='body',drag=null,lastDraw=-Infinity,dirty=true;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const release=()=>{
  for(const {model} of models){scene.remove(model.group);model.dispose?.();}
  models=[];keyState='';delete root.dataset.model;delete root.dataset.appearance;
 };
 const labels=root.querySelector('[data-preview-frames]');
 const syncFrameSelection=frame=>{
  for(const button of labels.children)button.setAttribute('aria-pressed',String(button.dataset.frame===frame));
 };
 for(const button of labels.children){
  button.addEventListener('click',()=>{
   selectFrame(button.dataset.frame);
   syncFrameSelection(button.dataset.frame);
  });
 }
 const setMode=next=>{
  mode=next;zoom=1;dirty=true;root.dataset.mode=next;labels.hidden=next!=='frames';
  if(next==='frames'){
   const meta=getMeta();
   syncFrameSelection(normalizeAppearance(meta.ap,meta.a).frame);
  }
  for(const b of root.querySelectorAll('[data-preview-mode]'))b.setAttribute('aria-pressed',String(b.dataset.previewMode===next));
 };
 const reset=()=>{yaw=.36;pitch=.10;setMode('body');root.dataset.yaw=String(yaw);root.dataset.zoom=String(zoom);};
 const rotate=delta=>{yaw+=delta;root.dataset.yaw=String(yaw);dirty=true;};
 const magnify=delta=>{zoom=clamp(zoom*Math.exp(delta),.65,2.4);root.dataset.zoom=String(zoom);dirty=true;};
 const observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);if(!visible)release();else dirty=true;},{threshold:0.05});
 observer.observe(canvas);
 const onMotionChange=()=>{dirty=true;};
 motionPreference.addEventListener('change',onMotionChange);
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
  const meta=getMeta();
  const appearance=normalizeAppearance(meta.ap,meta.a);
  const choices=mode==='frames'
   ?Object.values(FRAMES).map(({id})=>({...meta,ap:encodeAppearance({...appearance,frame:id})}))
   :[meta];
  const specs=choices.map(choice=>({choice,glb:useGlb(choice)}));
  const next=JSON.stringify([meta.ap,specs]);
  const w=Math.max(1,Math.round(canvas.clientWidth)),h=Math.max(1,Math.round(canvas.clientHeight));
  const resized=canvas.width!==Math.floor(w*(renderer?.getPixelRatio()||1))
   ||canvas.height!==Math.floor(h*(renderer?.getPixelRatio()||1));
  if(!dirty&&!resized&&next===keyState&&renderer&&(motionPreference.matches||now-lastDraw<1000/15))return true;
  try{
   if(!renderer){
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
   }
   if(next!==keyState){
    release();
    for(const {choice,glb} of specs){
     const model=createModel(assets,choice,glb);
     const entry={model};
     models.push(entry);
     scene.add(model.group);
     model.update(.08,{t:1,speed:0,dead:false,attack:0,cast:0,hit:0,air:false,mode:'triage',act:'idle',casting:false,combat:false,charge:0,fwd:1,interval:0});
     model.group.updateMatrixWorld(true);
     const bounds=new THREE.Box3().setFromObject(model.group),size=bounds.getSize(new THREE.Vector3());
     if(!Number.isFinite(size.y)||size.y<=0)throw Error('Invalid preview bounds');
     entry.center=bounds.getCenter(new THREE.Vector3());
     entry.height=size.y;
     entry.width=Math.hypot(size.x,size.z);
    }
    keyState=next;
    root.dataset.model=models[0].model.kind;root.dataset.appearance=meta.ap;
    status.textContent=models.every(({model})=>model.kind==='glb')?(models.length===1?'Live gameplay character':'Live gameplay models'):'Simplified gameplay asset; full model unavailable';
   }
   if(mode==='frames')syncFrameSelection(appearance.frame);
   const d=renderer.getSize(new THREE.Vector2());
   if(d.x!==w||d.y!==h)renderer.setSize(w,h,false);
   const size=models.length;
   const step=Number.isFinite(lastDraw)?clamp((now-lastDraw)/1000,0,.1):dt;
   renderer.setScissorTest(size>1);
   for(const [i,{model,center,height,width}] of models.entries()){
    for(const entry of models)entry.model.group.visible=entry.model===model;
    const left=Math.floor(w*i/size),viewWidth=Math.max(1,Math.floor(w*(i+1)/size)-left);
    renderer.setViewport(left,0,viewWidth,h);
    renderer.setScissor(left,0,viewWidth,h);
    camera.aspect=viewWidth/h;
    const focus=center.clone();if(mode==='face')focus.y+=height*.34;
    const framing=mode==='face'?height*.31:Math.max(...models.map(entry=>Math.max(entry.height*1.2,entry.width*1.22/camera.aspect)));
    const distance=framing/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))/zoom;
    camera.position.copy(focus).add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(distance));camera.lookAt(focus);camera.updateProjectionMatrix();
    if(!motionPreference.matches)model.update(step,{t:now/1000,speed:0,dead:false,attack:0,cast:0,hit:0,air:false,mode:'triage',act:'idle',casting:false,combat:false,charge:0,fwd:1,interval:0});
    renderer.render(scene,camera);
   }
   renderer.setScissorTest(false);
   lastDraw=now;dirty=false;return true;
  }catch(err){
   release();renderer?.dispose();renderer=null;failed=true;
   status.textContent='3D preview unavailable on this device. Your appearance selections still apply.';
   return false;
  }
 }
 function destroy(){observer.disconnect();motionPreference.removeEventListener('change',onMotionChange);release();renderer?.dispose();renderer?.forceContextLoss();renderer=null;failed=true;}
 return {update,release,active,destroy};
}
