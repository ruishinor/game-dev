// Quiet, weapon-local Warden rifle instrumentation, not a projectile or muzzle flash.
// A single lightweight mesh carries recessed rail conduits and recognition ticks;
// one shader program is shared between guards of the same equipment family.
import * as THREE from 'three';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function buildWardenRifleConduits(length,id){
  const pos=[],progress=[],lane=[],indices=[];
  const add=(x,z0,z1,width,kind)=>{
    const n=pos.length/3;
    // +Y is the actual top face of the rebuilt rifle's existing top rail.
    const y=.134;
    for(const [z,p] of [[z0,0],[z1,1]]){
      for(const dx of [-width*.5,width*.5]){
        pos.push(x+dx,y,z);progress.push(p);lane.push(kind);
      }
    }
    indices.push(n,n+1,n+3,n,n+3,n+2);
  };
  const long=id==='marksman';
  const start=-length*(long?.15:.09),end=length*(long?.27:.13);
  add(-.052,start,end,.008,0);
  add(.052,start,end,.008,0);
  // The marksman has paired calibration ticks; the carbine has a compact
  // receiver readiness marker. These share the same draw and material.
  if(long){
    for(let i=0;i<5;i++){
      const z=length*(.025+i*.043);
      add(-.018,z,z+.012,.006,1);
    }
  }else{
    for(let i=0;i<3;i++){
      const z=length*(-.06+i*.035);
      add(.015,z,z+.008,.007,1);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geometry.setAttribute('aProgress',new THREE.Float32BufferAttribute(progress,1));
  geometry.setAttribute('aLane',new THREE.Float32BufferAttribute(lane,1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const VERTEX=`
attribute float aProgress;
attribute float aLane;
varying float vProgress;
varying float vLane;
void main(){
  vProgress=aProgress;vLane=aLane;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;
const FRAGMENT=`
uniform vec3 uTint;
uniform float uTime;
uniform float uMotion;
uniform float uQuality;
uniform float uVariant;
varying float vProgress;
varying float vLane;
void main(){
  float phase=fract(vProgress-uTime*(uVariant>0.5?0.19:0.31));
  float scan=exp(-pow((phase-0.5)/0.085,2.0));
  float level=vLane>0.5?0.25:0.08+uMotion*scan*0.20;
  level*=(0.55+0.45*uQuality);
  gl_FragColor=vec4(mix(uTint,vec3(0.9,0.83,0.63),vLane*.20),clamp(level,0.0,0.39));
}`;

export function createWardenRifleFx(group,{id,length,optic}){
  const geo=buildWardenRifleConduits(length,id);
  const mat=new THREE.ShaderMaterial({
    uniforms:{uTint:{value:new THREE.Color().setRGB(...optic)},
      uTime:{value:0},uMotion:{value:1},uQuality:{value:1},
      uVariant:{value:id==='marksman'?1:0}},
    vertexShader:VERTEX,fragmentShader:FRAGMENT,
    transparent:true,depthWrite:false,depthTest:true,
    side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  });
  const mesh=new THREE.Mesh(geo,mat);
  mesh.name=id==='marksman'?'WardenMarksmanCalibration':'WardenCarbineStatus';
  mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;
  group.add(mesh);
  let time=0;
  return {
    group:mesh,
    inspect:()=>({kind:id,local:true,draws:1,emitsProjectiles:false,clock:time}),
    update(dt,st={}){
      time+=clamp(Number.isFinite(dt)?dt:0,0,.3);
      const quality=Number.isFinite(st.effectsQuality)?clamp(st.effectsQuality,0,2):2;
      mat.uniforms.uTime.value=time;
      mat.uniforms.uMotion.value=!!st.reducedMotion||quality===0?0:1;
      mat.uniforms.uQuality.value=quality/2;
      mesh.visible=st.cameraDistance===undefined||st.cameraDistance<24;
    },
    dispose(){mesh.removeFromParent();geo.dispose();mat.dispose();},
  };
}
