// Attunement character presentation: reference-locked menu composition.
//
// The environment uses the EXISTING Severance Gate GLB, not a redesigned
// imitation. It is isolated from world authority, travel, landmark controller
// and reserved Expanse development. Only the actual gameplay model is rendered
// in front of it by creation-preview.js.
import * as THREE from '/vendor/three/three.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { SEVERANCE_GATE_URL } from './severance-gate.js';

// Both creator and roster share the decode. Each gets independent material
// instances while the loaded GLB's geometry and textures remain immutable.
let gateSourcePromise;
function gateSource(){
 if(!gateSourcePromise){
  const loader=new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  gateSourcePromise=loader.loadAsync(SEVERANCE_GATE_URL)
   .then(gltf=>{
    const near=gltf.scenes.find(sc=>sc.name==='Near');
    if(!near)throw new Error('Severance Gate GLB has no Near scene');
    return near;
   })
   .catch(err=>{
    // A later preview attempt can retry after a transient asset failure.
    gateSourcePromise=null;
    console.warn('[selection] Gate asset unavailable:',err?.message??err);
    return null;
   });
 }
 return gateSourcePromise;
}
// Begin fetching while the user is at login, before the selection canvas starts.
export function preloadSelectionGate(){return gateSource();}
// Start the immutable artwork download at the login screen, not only after
// the player authenticates. Character switching never restarts this request.
const preloadedGate=preloadSelectionGate();

function noise(x,z,seed=0){
 return Math.sin(x*.229+seed*3.17)*Math.cos(z*.311-seed*1.7)*.5
       +Math.sin(x*.074+z*.121+seed)*.25
       +Math.sin(x*.69-z*.27+seed)*.08;
}

function stoneTexture(){
 const w=256,h=256,data=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const seed=Math.sin(x*127.1+y*311.7)*43758.5453;
  const fine=(seed-Math.floor(seed)-.5)*24;
  const band=Math.sin(y*.068+x*.021)*13+Math.sin(y*.21-x*.07)*8;
  const v=Math.max(70,Math.min(207,133+fine+band));
  const i=(y*w+x)*4;
  data[i]=Math.round(v*.88);data[i+1]=Math.round(v*.93);
  data[i+2]=Math.round(v);data[i+3]=255;
 }
 const tex=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);
 tex.colorSpace=THREE.SRGBColorSpace;
 tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
 tex.repeat.set(8,7);tex.magFilter=THREE.LinearFilter;
 tex.minFilter=THREE.LinearMipmapLinearFilter;
 tex.generateMipmaps=true;tex.needsUpdate=true;
 return tex;
}
const AMBER=0xd98c55;
export function createSelectionEnvironment(scene){
 const root=new THREE.Group();root.name='selection-reference-stage';scene.add(root);
 const ownedGeometry=new Set(),ownedMaterials=new Set();
 const geometry=g=>{ownedGeometry.add(g);return g;};
 const material=m=>{ownedMaterials.add(m);return m;};
 const grain=stoneTexture();
 const groundMat=material(new THREE.MeshStandardMaterial({
  color:0x303844,map:grain,roughness:.97,metalness:.015
 }));
 const cliffMat=material(new THREE.MeshStandardMaterial({
  color:0x171e2a,map:grain,roughness:.99,metalness:0,flatShading:true
 }));
 const rockMat=material(new THREE.MeshStandardMaterial({
  color:0x343a43,map:grain,roughness:.97,metalness:.025,flatShading:true
 }));
 // A continuous rocky surface, not the invented round presentation dais.
 // Large side ridges leave the centre clear for the *real* gate's staircase.
 const terrain=geometry(new THREE.PlaneGeometry(160,135,100,82));
 terrain.rotateX(-Math.PI/2);
 const a=terrain.getAttribute('position');
 for(let i=0;i<a.count;i++){
  const x=a.getX(i),z=a.getZ(i);
  const side=Math.max(0,Math.abs(x)-10.2);
  const rear=Math.max(0,-z-25);
  const cliff=Math.pow(side/11,1.5)*5.5+Math.pow(rear/25,1.4)*2.6;
  const disturbed=Math.max(0,Math.abs(x)-3)*.012*noise(x,z);
  const y=-.22+cliff+noise(x,z,.3)*Math.min(1,side/8)*1.1+disturbed;
  a.setY(i,y);
 }
 a.needsUpdate=true;terrain.computeVertexNormals();
 const ground=new THREE.Mesh(terrain,groundMat);
 ground.receiveShadow=true;root.add(ground);

 // Weathered canyon silhouettes using the same geology, deliberately behind
 // the hero, never passing through the model or crossing the UI gutters.
 for(const side of [-1,1])for(let i=0;i<7;i++){
  const h=6.3+(i%3)*2.7+Math.abs(Math.sin(i*3.9))*2.1;
  const geo=geometry(new THREE.DodecahedronGeometry(1,1));
  const ridge=new THREE.Mesh(geo,cliffMat);
  ridge.position.set(side*(11.7+i*3.7),h*.28,-18.5-i*4.1);
  ridge.scale.set(5.2+i*.48,h*.78,5.9+i*.9);
  ridge.rotation.set(.08*i,side*.15*i,.04*side*i);
  ridge.receiveShadow=true;root.add(ridge);
 }
 for(let i=0;i<18;i++){
  const theta=i*2.39996,dist=4.4+(i%7)*.66;
  const rubble=new THREE.Mesh(geometry(new THREE.DodecahedronGeometry(.23+(i%4)*.13,0)),i%3?rockMat:cliffMat);
  rubble.position.set(Math.sin(theta)*dist,-.12,Math.cos(theta)*dist-3.2);
  rubble.rotation.set(.17*i,.37*i,.1*i);
  rubble.scale.y=.36;rubble.receiveShadow=true;root.add(rubble);
 }

 // Keep the authentic gate frame and material detail. The original asset is
 // 28 metres high, so it is staged behind a life-size ~2m character; never
 // scale it from a guessed bounding box or borrow the Sanctum's generic door.
 const gateway=new THREE.Group();
 gateway.name='existing-severance-gate-menu-instance';
 gateway.position.set(0,-.24,-12.8);
 gateway.scale.setScalar(.43);
 root.add(gateway);
 let loaded=false,unavailable=false,disposed=false,visual=null;
 const gateMats=[];
 gateSource().then(source=>{
  if(disposed)return;
  if(!source){unavailable=true;return;}
  visual=source.clone(true);
  visual.name='Severance Gate | near-detail GLB';
  const cloned=new Map();
  visual.traverse(node=>{
   if(!node.isMesh)return;
   node.castShadow=false;node.receiveShadow=true;
   const cloneMat=original=>{
    if(cloned.has(original))return cloned.get(original);
    const mat=original.clone();
    cloned.set(original,mat);gateMats.push(mat);
    // The GLB exports placeholders for in-world VFX shader materials.
    // Restore their reserved rune/channel identity, without changing the GLB.
    const name=original.name||'';
    if(name==='SG_Rune'||name==='SG_RuneDim'){
     mat.color?.setHex(0xa66b4f);
     mat.emissive?.setHex(AMBER);
     mat.emissiveIntensity=name==='SG_Rune' ? .52 : .13;
    }else if(name==='SG_Channel'||name==='SG_Lamp'){
     mat.color?.setHex(0x9a6858);
     mat.emissive?.setHex(0xbe794b);
     mat.emissiveIntensity=.35;
    }
    return mat;
   };
   node.material=Array.isArray(node.material)
    ?node.material.map(cloneMat):cloneMat(node.material);
  });
  gateway.add(visual);
  loaded=true;
 });

 // The reference's ancient suspended rings and celestial seam are restrained
 // environmental accents. They are not gameplay portal states or fake loot.
 const orbitMat=material(new THREE.MeshBasicMaterial({
  color:0x976e53,transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide
 }));
 const orbit=[];
 for(let i=0;i<3;i++){
  const geom=geometry(new THREE.TorusGeometry(5.45+i*.6,.013,4,128));
  const ring=new THREE.Mesh(geom,orbitMat);
  ring.position.set(0,8.5+i*.5,-12.5);
  ring.rotation.set(.25+i*.2,.2+i*.55,.21+i*.33);
  root.add(ring);orbit.push(ring);
 }
 const motesCount=140;
 const positions=new Float32Array(motesCount*3);
 for(let i=0;i<motesCount;i++){
  const f=n=>{const s=Math.sin(i*17.3+n*47.1)*43758.545;return s-Math.floor(s);};
  positions[i*3]=(f(1)-.5)*22;
  positions[i*3+1]=1+f(2)*14;
  positions[i*3+2]=-3-f(3)*21;
 }
 const moteGeom=geometry(new THREE.BufferGeometry());
 moteGeom.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const moteMat=material(new THREE.PointsMaterial({
  color:0xb3b2ae,size:.026,transparent:true,opacity:.48,
  sizeAttenuation:true,depthWrite:false
 }));
 const motes=new THREE.Points(moteGeom,moteMat);root.add(motes);
 const portalLamp=new THREE.PointLight(0xe4a879,1.6,21,2);
 portalLamp.position.set(0,3.9,-11.4);root.add(portalLamp);
 const lowFill=new THREE.PointLight(0x8596a9,1.15,11,2);
 lowFill.position.set(-3,2.6,2.3);root.add(lowFill);

 function update(t,reducedMotion){
  const motion=reducedMotion?0:1;
  orbit.forEach((ring,i)=>{
   ring.rotation.z=(.21+i*.33)+motion*Math.sin(t*.045+i*1.6)*.14;
  });
  motes.rotation.y=motion*Math.sin(t*.036)*.016;
  portalLamp.intensity=loaded?1.45+(motion*.13*Math.sin(t*.42)):.5;
 }
 function dispose(){
  disposed=true;
  scene.remove(root);
  for(const m of gateMats)m.dispose();
  for(const m of ownedMaterials)m.dispose();
  for(const g of ownedGeometry)g.dispose();
  grain.dispose();
  visual=null;
 }
 return {update,dispose,get ready(){return loaded;},get unavailable(){return unavailable;},root};
}
