// Character creation uses exactly the gameplay model factory and appearance
// metadata. Preview state is presentation-only, never character authority.
import * as THREE from '/vendor/three/three.module.js';
import {createModel} from './characters.js';
import {createSelectionEnvironment} from './selection-environment.js';
import {encodeAppearance, FRAMES, normalizeAppearance} from '../../shared/appearance.js';

export function createCreationPreview({root,assets,useGlb,motionPreference,getMeta,selectFrame,variant='creation'}){
 const canvas=root.querySelector('canvas'),status=root.querySelector('[data-preview-status]');
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.01,100);
 scene.background=new THREE.Color(0x132029);
 scene.add(new THREE.HemisphereLight(0xd4efff,0x3a352f,2.4));
 const environment=variant==='selection'?createSelectionEnvironment(scene):null;
 if(environment){
  scene.background=new THREE.Color(0x050b12);
  scene.fog=new THREE.FogExp2(0x07111b,.032);
  // Cooler neutral lighting respects the character's *actual* material colours.
  scene.children.find(obj=>obj.isHemisphereLight).color.setHex(0xc3deec);
  scene.children.find(obj=>obj.isHemisphereLight).groundColor.setHex(0x172330);
  scene.children.find(obj=>obj.isHemisphereLight).intensity=1.65;
 }

 const key=new THREE.DirectionalLight(environment?0xe6f3ff:0xffeee0,environment?2.9:3.2);key.position.set(3,5,4);scene.add(key);
 const rim=new THREE.DirectionalLight(0x77b2d8,environment?1.75:1.8);rim.position.set(-3,2,-3);scene.add(rim);
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
 const magnify=delta=>{zoom=clamp(zoom*Math.exp(delta),environment?.75:.65,environment?1.9:2.4);root.dataset.zoom=String(zoom);dirty=true;};
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
  const appearance=meta?normalizeAppearance(meta.ap,meta.a):null;
  const choices=!meta?[]:mode==='frames'
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
    if(models.length){
     root.dataset.model=models[0].model.kind;root.dataset.appearance=meta.ap;
     status.textContent=models.every(({model})=>model.kind==='glb')?'Actual gameplay model · drag to rotate':'Simplified gameplay model · detailed asset unavailable';
    }else status.textContent='Select a character';

   }
   if(mode==='frames'&&appearance)syncFrameSelection(appearance.frame);
   const d=renderer.getSize(new THREE.Vector2());
   if(d.x!==w||d.y!==h)renderer.setSize(w,h,false);
   const size=models.length;
   environment?.update(now/1000,motionPreference.matches);
   const step=Number.isFinite(lastDraw)?clamp((now-lastDraw)/1000,0,.1):dt;
   renderer.setScissorTest(size>1);
   if(!size){
    camera.aspect=w/h;camera.position.set(1.2,4.1,12.5);
    camera.lookAt(0,2.9,-4.5);camera.updateProjectionMatrix();
    renderer.setViewport(0,0,w,h);renderer.render(scene,camera);
   }
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
 function destroy(){observer.disconnect();motionPreference.removeEventListener('change',onMotionChange);release();environment?.dispose();renderer?.dispose();renderer?.forceContextLoss();renderer=null;failed=true;}
 return {update,release,active,destroy};
}
