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
 const environment=variant==='selection'?createSelectionEnvironment(scene,assets):null;
 if(environment){
  // Preserve the actual image backdrop; only the live character is WebGL.
  scene.background=null;
  scene.fog=null;
  // Cooler neutral lighting respects the character's *actual* material colours.
  scene.children.find(obj=>obj.isHemisphereLight).color.setHex(0xd7dee8);
  scene.children.find(obj=>obj.isHemisphereLight).groundColor.setHex(0x1d2430);
  scene.children.find(obj=>obj.isHemisphereLight).intensity=1.6;
 }

 const key=new THREE.DirectionalLight(environment?0xe3e6ed:0xffeee0,environment?2.3:3.2);key.position.set(3,5,4);scene.add(key);
 const rim=new THREE.DirectionalLight(0x849cb3,environment?1.65:1.8);rim.position.set(-3,2,-3);scene.add(rim);
 let renderer=null,models=[],keyState='',failed=false,visible=false,lastStageReady=false;
 let yaw=0,pitch=.045,zoom=1,mode='body',drag=null,lastDraw=-Infinity,dirty=true;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const release=()=>{
  for(const {model} of models){scene.remove(model.group);model.dispose?.();}
  models=[];keyState='';delete root.dataset.model;delete root.dataset.modelCount;delete root.dataset.appearance;delete root.dataset.frameReady;
 };
 const inspectToggle=root.querySelector('[data-preview-inspect]');
 const inspectControls=root.querySelector('.preview-controls');
 const setInspector=open=>{
  if(!inspectToggle||!inspectControls)return;
  inspectControls.hidden=!open;
  inspectToggle.setAttribute('aria-expanded',String(open));
  inspectToggle.textContent=open?'Close inspection':'Inspect character';
 };
 inspectToggle?.addEventListener('click',()=>setInspector(inspectControls.hidden));
 setInspector(false);
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
 const setMode=selected=>{
  // Comparing two models splits the actual world canvas and pushes one
  // character under the customisation panel. The saved body-frame chooser
  // already provides the authoritative single-character preview.
  const next=environment&&selected==='frames'?'body':selected;
  mode=next;zoom=1;dirty=true;root.dataset.mode=next;
  labels.hidden=environment||next!=='frames';
  if(next==='frames'){
   const meta=getMeta();
   syncFrameSelection(normalizeAppearance(meta.ap,meta.a).frame);
  }
  for(const b of inspectControls?.querySelectorAll('[data-preview-mode]')??[])b.setAttribute('aria-pressed',String(b.dataset.previewMode===next));
 };
 const reset=()=>{yaw=0;pitch=.045;setMode('body');root.dataset.yaw=String(yaw);root.dataset.zoom=String(zoom);};
 const rotate=delta=>{yaw+=delta;root.dataset.yaw=String(yaw);dirty=true;};
 const magnify=delta=>{zoom=clamp(zoom*Math.exp(delta),environment ? 0.75 : 0.65,environment ? 1.9 : 2.4);root.dataset.zoom=String(zoom);dirty=true;};
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
 canvas.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;rotate((drag.x-e.clientX)*.012);pitch=clamp(pitch+(e.clientY-drag.y)*.003,-.16,.22);drag.x=e.clientX;drag.y=e.clientY;});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(drag?.id===e.pointerId)drag=null;});
 canvas.addEventListener('wheel',e=>{if(document.activeElement!==canvas)return;e.preventDefault();magnify(-e.deltaY*.001);},{passive:false});
 canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Home'].includes(e.key))return;e.preventDefault();e.stopPropagation();if(e.key==='ArrowLeft')rotate(-.24);else if(e.key==='ArrowRight')rotate(.24);else if(e.key==='ArrowUp'||e.key==='+')magnify(.18);else if(e.key==='ArrowDown'||e.key==='-')magnify(-.18);else reset();});
 reset();
 const active=()=>visible&&!failed&&!document.hidden&&canvas.getClientRects().length>0;
 function update(now,dt){
  if(!active())return false;
  const stageReady=!!environment?.ready,stageFailed=!!environment?.unavailable;
  if(environment&&(stageReady!==lastStageReady||stageFailed&&root.dataset.sceneAsset!=='unavailable')){
   lastStageReady=stageReady;dirty=true;
  }
  if(environment)root.dataset.sceneAsset=stageReady?'reference-image':stageFailed?'unavailable':'loading';
  const meta=getMeta();
  const appearance=meta?normalizeAppearance(meta.ap,meta.a):null;
  const choices=!meta?[]:environment?[meta]:mode==='frames'
   ?Object.values(FRAMES).map(({id})=>({...meta,ap:encodeAppearance({...appearance,frame:id})}))
   :[meta];
  const specs=choices.map(choice=>({choice,glb:useGlb(choice)}));
  const next=JSON.stringify([meta?.ap??null,specs]);
  const w=Math.max(1,Math.round(canvas.clientWidth)),h=Math.max(1,Math.round(canvas.clientHeight));
  const resized=canvas.width!==Math.floor(w*(renderer?.getPixelRatio()||1))
   ||canvas.height!==Math.floor(h*(renderer?.getPixelRatio()||1));
  if(!dirty&&!resized&&next===keyState&&renderer&&(motionPreference.matches||now-lastDraw<1000/15))return true;
  try{
   if(!renderer){
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:!!environment,powerPreference:'low-power'});
    if(environment)renderer.setClearColor(0x000000,0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=environment?1.17:1.15;
   }
   if(next!==keyState){
    release();
    for(const {choice,glb} of specs){
     const model=createModel(assets,choice,glb);
     const entry={model};
     models.push(entry);
     scene.add(model.group);
     model.update(.08,{t:1,speed:0,dead:false,attack:0,cast:0,hit:0,air:false,mode:'triage',act:'idle',casting:false,combat:false,charge:0,fwd:1,interval:0,electricalRod:choice.er===2?'dual':choice.er===1?'rod':null,reducedMotion:true});
     // Center the exact persisted character on the viewport axis.
     if(environment)model.group.position.x=0;
     model.group.updateMatrixWorld(true);
     const bounds=new THREE.Box3().setFromObject(model.group),size=bounds.getSize(new THREE.Vector3());
     if(!Number.isFinite(size.y)||size.y<=0)throw Error('Invalid preview bounds');
     entry.center=bounds.getCenter(new THREE.Vector3());
     entry.height=size.y;
     entry.width=Math.hypot(size.x,size.z);
    }
    keyState=next;
    root.dataset.modelCount=String(models.length);
    if(models.length){
     root.dataset.model=models[0].model.kind;root.dataset.appearance=meta.ap;
     status.textContent=models.every(({model})=>model.kind==='glb')?'':'Simplified gameplay model · detailed asset unavailable';
    }else status.textContent='';

   }
   if(stageFailed)status.textContent='Gate artwork unavailable. Your character and world entry still work.';
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
    const focus=center.clone();
    // The environment does not orbit with the character. Rotate the model
    // itself and keep the monument, ground and interface in a fixed frame.
    model.group.rotation.y=yaw;
    if(environment)focus.x=center.x;
    if(mode==='face')focus.y+=height*.34;
    else if(environment){
      // The image has its gate base low in frame. Lower the displayed
      // character without moving its actual physical/world position.
      focus.y+=height*(root.id==='roster-preview'?.12:.055);
      if(camera.aspect<.8)focus.y+=height*.035;
    }
    const framing=mode==='face'?height*.38:Math.max(...models.map(entry=>Math.max(entry.height*(environment?1.50:1.2),entry.width*1.22/camera.aspect)));
    const distance=framing/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))/zoom;
    camera.position.set(focus.x,focus.y+Math.sin(pitch)*distance,focus.z+Math.cos(pitch)*distance);
    camera.lookAt(focus);camera.updateProjectionMatrix();
    if(!motionPreference.matches)model.update(step,{t:now/1000,speed:0,dead:false,attack:0,cast:0,hit:0,air:false,mode:'triage',act:'idle',casting:false,combat:false,charge:0,fwd:1,interval:0,electricalRod:meta?.er===2?'dual':meta?.er===1?'rod':null,reducedMotion:motionPreference.matches});
    renderer.render(scene,camera);
   }
   renderer.setScissorTest(false);
   root.dataset.frameReady='yes';
   lastDraw=now;dirty=false;return true;
  }catch(err){
   release();renderer?.dispose();renderer=null;failed=true;
   status.textContent='3D preview unavailable on this device. Your appearance selections still apply.';
   return false;
  }
 }
 function destroy(){observer.disconnect();motionPreference.removeEventListener('change',onMotionChange);release();environment?.dispose();renderer?.dispose();renderer?.forceContextLoss();renderer=null;failed=true;}
 return {update,release,active,destroy,closeInspector:()=>setInspector(false)};
}
