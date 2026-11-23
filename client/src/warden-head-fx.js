// Warden-only, character-local instrumentation for the *existing skinned head ring*.
// No VFX-pool allocation, world lights, combat events or detached replacement head.
// The ring stays the face. Sensor geometry is fitted once to its live skinned bounds.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));

export function measureWardenRing(ring,head) {
  if (!ring?.isSkinnedMesh || !head?.isBone || !ring.geometry?.getAttribute('position')) return null;
  ring.updateWorldMatrix(true,true);
  head.updateWorldMatrix(true,true);
  const attribute = ring.geometry.getAttribute('position');
  const index = ring.geometry.index;
  const count = index ? index.count : attribute.count;
  const inv = head.matrixWorld.clone().invert();
  const p = new THREE.Vector3(), box = new THREE.Box3().makeEmpty();
  // Only the actual indexed ring triangles, never the parent body's bounding box.
  for(let i=0;i<count;i++){
    const vertex = index ? index.getX(i) : i;
    ring.getVertexPosition(vertex,p);
    p.applyMatrix4(ring.matrixWorld).applyMatrix4(inv);
    if(Number.isFinite(p.x+p.y+p.z)) box.expandByPoint(p);
  }
  if(box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  if(size.x < .06 || size.x > .8 || size.y < .06 || size.y > .8) return null;
  return {
    center: box.getCenter(new THREE.Vector3()),
    halfWidth: size.x * .5,
    halfHeight: size.y * .5,
    front: box.max.z,
  };
}

// Three concentric functions of a *single* elliptical strip mesh:
// inner-facing recognition scan, recessed optical reflection and six tiny
// position indicators. No spheres, screen-space halos or permanent light cones.
export function buildWardenSensorGeometry(bounds) {
  const position=[],angle=[],layer=[],index=[];
  const addBand=(inner,outer,z,kind,from=0,to=TAU,segments=96)=>{
    const base=position.length/3;
    for(let i=0;i<=segments;i++){
      const a=from+(to-from)*i/segments;
      for(const radius of [inner,outer]){
        position.push(bounds.center.x+Math.cos(a)*bounds.halfWidth*radius,
          bounds.center.y+Math.sin(a)*bounds.halfHeight*radius,z);
        angle.push(a);layer.push(kind);
      }
      if(i>0){const v=base+2*i;index.push(v-2,v-1,v+1,v-2,v+1,v);}
    }
  };
  const z=bounds.front+.003;
  addBand(.68,.735,z,0);
  addBand(.79,.815,z-.006,1);
  for(let i=0;i<6;i++){
    const a=i*TAU/6+Math.PI/6;
    addBand(.57,.64,z+.002,2,a-.055,a+.055,5);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  g.setAttribute('aAngle',new THREE.Float32BufferAttribute(angle,1));
  g.setAttribute('aLayer',new THREE.Float32BufferAttribute(layer,1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}
const VERTEX = `
attribute float aAngle;
attribute float aLayer;
varying float vAngle;
varying float vLayer;
void main(){
  vAngle=aAngle;vLayer=aLayer;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;
const FRAGMENT = `
uniform vec3 uColor;
uniform float uTime;
uniform float uPhase;
uniform float uAttention;
uniform float uRecognition;
uniform float uMotion;
uniform float uQuality;
varying float vAngle;
varying float vLayer;
float around(float a,float b){return abs(atan(sin(a-b),cos(a-b)));}
void main(){
  float theta=mod(uPhase+uTime*0.58,6.2831853);
  float focus=exp(-pow(around(vAngle,theta)/0.20,2.0));
  float echo=exp(-pow(around(vAngle,theta+0.33)/0.09,2.0));
  float light=0.0;
  if(vLayer<0.5){
    light=0.065+uMotion*(0.22+0.36*uAttention+0.22*uRecognition)*(focus+0.30*echo);
  }else if(vLayer<1.5){
    light=0.036+uMotion*(0.034+0.06*uAttention)*(0.5+0.5*cos(vAngle*12.0-uTime*0.6));
  }else{
    light=0.18+0.10*uAttention+0.13*uRecognition;
  }
  light *= (0.64+0.36*uQuality);
  // Deliberately dim: the PBR ring and its actual integrated optics remain legible.
  gl_FragColor=vec4(mix(uColor,vec3(0.83,0.91,0.89),0.14),clamp(light,0.0,0.52));
}`;

export function createWardenHeadFx(inst,{variant=0,optic=[.75,.85,.9]}={}) {
  const ring=inst?.getObjectByName('ring_vertical');
  const head=inst?.getObjectByName('Head');
  const bounds=measureWardenRing(ring,head);
  if(!bounds){
    console.warn('[wardens] cannot fit head instrumentation to the skinned ring');
    return null; // Keep the production face intact, never substitute a floating ring.
  }
  const geometry=buildWardenSensorGeometry(bounds);
  const material=new THREE.ShaderMaterial({
    uniforms:{
      uColor:{value:new THREE.Color().setRGB(...optic)},
      uTime:{value:0},uPhase:{value:variant*1.07},uAttention:{value:0},
      uRecognition:{value:0},uMotion:{value:1},uQuality:{value:1},
    },
    vertexShader:VERTEX,fragmentShader:FRAGMENT,
    transparent:true,depthWrite:false,depthTest:true,
    side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='WardenHeadInnerSensor';
  mesh.castShadow=false;
  mesh.receiveShadow=false;
  mesh.frustumCulled=false; // Attached to a small animated head, not the bind-pose bounds.
  head.add(mesh);
  let clock=0,attention=0,recognition=0,closed=false;
  return {
    mesh,
    inspect:()=>({fitted:true,halfWidth:bounds.halfWidth,halfHeight:bounds.halfHeight,
      attention,recognition,local:true}),
    observe(){recognition=1;},
    update(dt,st={}){
      if(closed)return;
      const step=clamp(Number.isFinite(dt)?dt:0,0,.3);
      clock+=step;
      const near=Number.isFinite(st.near)&&st.near<=6&&!st.dead;
      attention+=((near?1:0)-attention)*Math.min(1,step*3);
      recognition=Math.max(0,recognition-step*.65);
      const quality=Number.isFinite(st.effectsQuality)?clamp(st.effectsQuality,0,2):2;
      const calm=!!st.reducedMotion||quality===0;
      material.uniforms.uTime.value=clock;
      material.uniforms.uAttention.value=attention;
      material.uniforms.uRecognition.value=recognition;
      material.uniforms.uMotion.value=calm?0:1;
      material.uniforms.uQuality.value=quality/2;
      // At distance a static face signal is retained, but moving scan is culled.
      mesh.visible=st.cameraDistance===undefined||st.cameraDistance<20;
    },
    dispose(){
      if(closed)return;closed=true;mesh.removeFromParent();geometry.dispose();material.dispose();
    },
  };
}
