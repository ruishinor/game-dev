// Capture the scene's ACTUAL static textured geometry, not a synthetic map.
// Rendered on first atlas open for each already-playable region; overlays for
// players, enemies, pickups and live VFX are hidden and never sampled.
// The map retains a self-contained 2D fallback if WebGL readback is unavailable.
import * as THREE from '/vendor/three/three.module.js';

export function atlasCaptureSize(region,maximum=1440){
  if(!region||!Number.isFinite(region.hw)||!Number.isFinite(region.hd)||
     region.hw<=0||region.hd<=0)return null;
  const span=Math.max(region.hw*2,region.hd*2),scale=Math.min(24,maximum/span);
  return {width:Math.max(64,Math.round(region.hw*2*scale)),
    height:Math.max(64,Math.round(region.hd*2*scale))};
}

export function captureStaticAtlas(renderer,scene,staticRoots,region,{lowSpec=false}={}){
  if(!renderer||!scene||!staticRoots||!region)return null;
  // On software renderers the one-time capture must not stall normal input.
  const limit=Math.min(renderer.capabilities.maxTextureSize||2048,lowSpec?768:1440);
  const size=atlasCaptureSize(region,limit);
  if(!size)return null;
  const {width,height}=size,previousTarget=renderer.getRenderTarget();
  const savedViewport=renderer.getViewport(new THREE.Vector4());
  const savedScissor=renderer.getScissor(new THREE.Vector4());
  const savedScissorTest=renderer.getScissorTest();
  const previousFog=scene.fog,previousAutoClear=renderer.autoClear;
  const previousShadow=renderer.shadowMap.enabled;
  const previousVisibility=scene.children.map(root=>[root,root.visible]);
  // A permanent geographical atlas must not inherit nighttime darkness.
  // Restrict neutral survey illumination to Verdigris Reach; the reserved
  // Expanse/Foundry content and its production day/night lighting are untouched.
  const surveyFill=!region.area?new THREE.HemisphereLight(0xe7ede5,0x65736a,1.9):null;
  const surveySun=!region.area?new THREE.DirectionalLight(0xffedd9,1.5):null;
  let target=null;
  try{
    if(surveySun)surveySun.position.set(region.x-90,230,region.z-140);
    if(surveyFill)scene.add(surveyFill,surveySun);
    target=new THREE.WebGLRenderTarget(width,height,{depthBuffer:true,stencilBuffer:false});
    // X right, -Z north/up. Unlike the old blurred plate this is a direct
    // orthographic rendering of the existing Three.js terrain and props.
    const camera=new THREE.OrthographicCamera(-region.hw,region.hw,region.hd,-region.hd,.1,900);
    camera.position.set(region.x,280,region.z);
    camera.up.set(0,0,-1);
    camera.lookAt(region.x,0,region.z);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // Restrict the image to roots created by buildWorld. Players, companions,
    // enemy actors, selection rings, HUD/UI and live effects remain excluded.
    for(const [root] of previousVisibility){
      if(!staticRoots.has(root))root.visible=false;
    }
    scene.fog=null;
    renderer.autoClear=true;
    renderer.shadowMap.enabled=false;
    renderer.setRenderTarget(target);
    renderer.setViewport(0,0,width,height);
    renderer.setScissorTest(false);
    renderer.clear(true,true,true);
    renderer.render(scene,camera);
    const pixels=new Uint8Array(width*height*4);
    renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');
    if(!ctx)return null;
    const image=ctx.createImageData(width,height),rowBytes=width*4;
    // GPU pixels originate bottom-left; map coordinates originate top-left.
    for(let y=0;y<height;y++)
      image.data.set(pixels.subarray((height-y-1)*rowBytes,(height-y)*rowBytes),y*rowBytes);
    ctx.putImageData(image,0,0);
    return canvas;
  }catch(err){
    console.warn('[atlas] Static world capture unavailable; using source-grounded fallback:',err.message||err);
    return null;
  }finally{
    if(surveyFill)scene.remove(surveyFill,surveySun);
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(savedViewport);
    renderer.setScissor(savedScissor);
    renderer.setScissorTest(savedScissorTest);
    renderer.autoClear=previousAutoClear;
    renderer.shadowMap.enabled=previousShadow;
    scene.fog=previousFog;
    for(const [root,visible] of previousVisibility)root.visible=visible;
    target?.dispose();
  }
}
