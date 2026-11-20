// Resonance vestibule: an original, bounded presentation-only environment.
// This scene does not instantiate world gameplay or the owner-reserved Expanse.
import * as THREE from '/vendor/three/three.module.js';

const basalt = new THREE.MeshStandardMaterial({color:0x263744,roughness:.94,metalness:.06,flatShading:true});
const brokenStone = new THREE.MeshStandardMaterial({color:0x304552,roughness:.93,metalness:.04,flatShading:true});
const recess = new THREE.MeshStandardMaterial({color:0x0c1a27,roughness:.91,metalness:.22});
const metal = new THREE.MeshStandardMaterial({color:0x4f7083,roughness:.52,metalness:.66});
const etched = new THREE.MeshStandardMaterial({color:0x739aab,roughness:.45,metalness:.62});
const resonance = new THREE.MeshStandardMaterial({color:0x47788c,emissive:0x327a94,emissiveIntensity:.72,roughness:.35,metalness:.42});


function block(parent,material,size,pos,rotation=0){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);
 mesh.position.set(...pos);mesh.rotation.z=rotation;mesh.receiveShadow=true;
 parent.add(mesh);return mesh;
}
function rail(parent,a,b,radius,material){
 const delta=new THREE.Vector3().subVectors(new THREE.Vector3(...b),new THREE.Vector3(...a));
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,delta.length(),8),material);
 mesh.position.copy(new THREE.Vector3(...a).addScaledVector(delta,.5));
 mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
 parent.add(mesh);return mesh;
}

function createStrataTexture(){
 // A deterministic fine grain and fractured horizontal sediment band.
 // Shading is actual texture mapping, not a flat monochrome primitive.
 const c=document.createElement('canvas');c.width=c.height=256;
 const ctx=c.getContext('2d');
 if(!ctx)return null;
 const img=ctx.createImageData(256,256);
 let seed=0x91d4c7b3;
 const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const bands=Array.from({length:256},(_,y)=>10*Math.sin(y*.27)+7*Math.sin(y*.061)+5*Math.sin(y*.64));
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){
  const fine=(noise()-.5)*43;
  const pockets=18*Math.sin(x*.065+y*.13)*Math.cos(x*.023-y*.084);
  const v=Math.max(62,Math.min(227,158+fine+pockets+bands[y]));
  const i=(y*256+x)*4;
  img.data[i]=v*.89;img.data[i+1]=v*.96;img.data[i+2]=v;img.data[i+3]=255;
 }
 ctx.putImageData(img,0,0);
 const tex=new THREE.CanvasTexture(c);
 tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
 tex.repeat.set(3,3);
 tex.colorSpace=THREE.SRGBColorSpace;
 tex.anisotropy=4;
 return tex;
}

export function createSelectionEnvironment(scene,assets){
 const root=new THREE.Group();root.name='selection-resonance-vestibule';scene.add(root);
 const strata=createStrataTexture();
 // Share one texture across low-count rock meshes; dispose with this scene.
 if(strata){basalt.map=strata;basalt.bumpMap=strata;basalt.bumpScale=.075;
  brokenStone.map=strata;brokenStone.bumpMap=strata;brokenStone.bumpScale=.045;
  basalt.needsUpdate=brokenStone.needsUpdate=true;
 }

 // The platform is human-scale; the gate behind it reads as an ancient machine.
 const floor=new THREE.Mesh(new THREE.CylinderGeometry(12,13,.3,48),basalt);
 floor.position.y=-.25;floor.receiveShadow=true;root.add(floor);
 const nearDeck=new THREE.Mesh(new THREE.CylinderGeometry(2.18,2.32,.1,48),brokenStone);
 nearDeck.position.y=-.07;nearDeck.receiveShadow=true;root.add(nearDeck);
 const seam=new THREE.Mesh(new THREE.TorusGeometry(2.13,.018,6,88),etched);
 seam.rotation.x=-Math.PI/2;seam.position.y=.005;root.add(seam);
 for(let i=0;i<16;i++){
  const angle=i*Math.PI/8;
  const radial=new THREE.Mesh(new THREE.BoxGeometry(.012,.01,.36),etched);
  radial.position.set(Math.sin(angle)*2.03,.008,Math.cos(angle)*2.03);
  radial.rotation.y=angle;root.add(radial);
 }
 // A recessed transit chamber: layered basalt anchors, metal ribs and
 // a restrained resonance seam. No gratuitous volumetric wash or golden glow.
 const gate=new THREE.Group();gate.position.z=-7.2;root.add(gate);
 block(gate,recess,[7.8,7.9,1.5],[0,3.9,-.42]);
 block(gate,basalt,[5.6,6.7,.34],[0,3.35,.43]);
 block(gate,recess,[4.45,5.75,.18],[0,3.0,.62]);
 for(const side of [-1,1]){
  block(gate,basalt,[1.54,9.25,2.15],[side*4.0,4.15,-.3],side*.02);
  block(gate,metal,[.17,7.05,.12],[side*3.07,4.22,.85]);
  block(gate,brokenStone,[1.1,2.3,1.1],[side*4.62,.87,1.0],side*.07);
  block(gate,metal,[.46,8.3,.36],[side*5.25,4.1,-.2],side*.035);
  rail(gate,[side*3.12,8.06,.75],[side*1.95,9.05,.75],.095,etched);
  for(let n=0;n<6;n++)block(gate,etched,[.07,.16,.08],[side*3.08,1.7+n*.83,.93]);
 }
 block(gate,basalt,[10.8,1.05,2.3],[0,8.5,-.3]);
 block(gate,metal,[5.05,.14,.12],[0,8.06,.81]);
 const aperture=new THREE.Mesh(new THREE.TorusGeometry(1.86,.095,10,72),metal);
 aperture.position.set(0,4.08,.76);gate.add(aperture);
 const innerRing=new THREE.Mesh(new THREE.TorusGeometry(1.61,.023,6,88),resonance);
 innerRing.position.set(0,4.08,.82);gate.add(innerRing);
 const innerVoid=new THREE.Mesh(new THREE.CircleGeometry(1.55,64),recess);
 innerVoid.position.set(0,4.08,.77);gate.add(innerVoid);
 const spindle=block(gate,resonance,[.065,5.7,.05],[0,4.13,.86]);
 const crown=block(gate,metal,[.52,.94,.43],[0,8.25,.83]);
 for(let step=0;step<5;step++){
  block(root,step%2===0?basalt:brokenStone,[6.7-step*.15,.16,1.08],[0,-.17+step*.02,-4.02-step*.62]);
 }
 // Deep strata and canyon walls, with deliberate asymmetric silhouettes.
 for(const side of [-1,1]){
  for(let i=0;i<7;i++){
   const x=side*(6.25+i*1.2),z=-5.2-i*.8;
   const height=4.3+(i%3)*2.4+(i===4?3:0);
   const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),i%2?basalt:brokenStone);
   rock.scale.set(2.3+(i%2)*.7,height,2.6);rock.position.set(x,height*.36-.3,z);
   rock.rotation.set(.02*i,side*.15*i,side*.1);root.add(rock);
  }
  for(let i=0;i<4;i++){
   const shard=new THREE.Mesh(new THREE.ConeGeometry(.85+i*.12,2.2+i*.36,5),basalt);
   shard.position.set(side*(4+i*1.6),.4,-10.5-i*1.1);shard.rotation.z=side*.13;root.add(shard);
  }
 }
 // Horizontal resonance fracture and material joins create depth at
 // human scale; the rear transit structure must not read as one flat box.
 for(const side of [-1,1]){
  for(let j=0;j<4;j++){
   const metalBand=block(gate,metal,[.72,.18,.26],[side*4.04,1.25+j*1.83,1.13],side*.025);
   metalBand.castShadow=false;
   const socket=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.22,12),etched);
   socket.rotation.x=Math.PI/2;
   socket.position.set(side*3.28,1.25+j*1.83,1.05);gate.add(socket);
  }
 }
 // Broken, asymmetrical field debris; no collision because this scene is visual only.
 for(let i=0;i<26;i++){
  const t=i*2.3999,r=4.6+Math.sqrt(i)*1.23;
  const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.22+(i%4)*.09,0),i%3?basalt:brokenStone);
  rock.position.set(Math.sin(t)*r,.13+(i%3)*.05,Math.cos(t)*r-1.5);
  rock.rotation.set(t*.3,t*.7,t*.17);
  rock.scale.set(1.15,.4,.9);root.add(rock);
 }
 // Distant fixed stars and sparse suspended motes; intentionally no bloom.
 const particleCount=96,coords=new Float32Array(particleCount*3);
 for(let i=0;i<particleCount;i++){
  const s=Math.sin(i*127.1)*43758.5453;
  const t=Math.sin(i*71.73+9)*31217.11;
  const u=Math.sin(i*19.91+27)*17467.9;
  const r=(s-Math.floor(s));
  coords[i*3]=(r-.5)*17;
  coords[i*3+1]=.5+(t-Math.floor(t))*10;
  coords[i*3+2]=-2-(u-Math.floor(u))*16;
 }
 const cloudGeo=new THREE.BufferGeometry();
 cloudGeo.setAttribute('position',new THREE.BufferAttribute(coords,3));
 const cloudMat=new THREE.PointsMaterial({color:0x799cab,size:.027,transparent:true,opacity:.42,sizeAttenuation:true,depthWrite:false});
 const cloud=new THREE.Points(cloudGeo,cloudMat);root.add(cloud);
 const atmosphere=new THREE.PointLight(0x75b9d0,2.6,22,1.7);
 atmosphere.position.set(0,5,-5.7);root.add(atmosphere);
 // A low key reveals the floor and stone rather than silhouetting the entire
 // facade. Narrow accents keep the character as the visual focal point.
 const deckLight=new THREE.PointLight(0x9fcfdd,1.8,10,2);
 deckLight.position.set(-2.3,3.2,3.8);root.add(deckLight);
 const portalFill=new THREE.PointLight(0x4b95ae,1.7,11,2);
 portalFill.position.set(0,3.6,-4.8);root.add(portalFill);
 // Prefer authentic Attunement Sanctum kit geometry when the bundle is ready.
 // These instances share the gameplay bundle's immutable GLB geometry: never
 // mutate its materials or dispose a bundle-owned geometry.
 const ownedGeometry=new Set();
 root.traverse(object=>{if(object.geometry)ownedGeometry.add(object.geometry);});
 const ownedMaterials=new Set();
 const kit=(piece,position,scale)=>{
  const instance=assets?.instance('sanctum',piece);
  if(!instance)return;
  instance.position.set(...position);instance.scale.set(...scale);
  instance.traverse(node=>{
   if(!node.isMesh)return;
   node.receiveShadow=true;node.castShadow=false;
   const clone=material=>{
    const m=material.clone();
    // Suppress yellow/green kit accents in this distinct cold selection scene.
    if(m.color)m.color.setHex(0x8ca7b9);
    if(m.emissive)m.emissive.setHex(0x07151d);
    ownedMaterials.add(m);return m;
   };
   node.material=Array.isArray(node.material)?node.material.map(clone):clone(node.material);
  });
  root.add(instance);
 };
 kit('Platform_Round1',[0,-.13,0],[.77,.75,.77]);
 kit('Door_Frame_Square',[0,.2,-6.58],[1.46,1.49,1.05]);
 kit('Column_Hollow',[-5.15,-.15,-7.1],[1.07,1.6,1.07]);
 kit('Column_Hollow',[5.15,-.15,-7.1],[1.07,1.6,1.07]);
 const update=(seconds,reducedMotion)=>{
  if(reducedMotion){cloud.rotation.y=0;innerRing.rotation.z=0;atmosphere.intensity=.8;return;}
  cloud.rotation.y=Math.sin(seconds*.045)*.012;
  innerRing.rotation.z=Math.sin(seconds*.065)*.025;
  atmosphere.intensity=.85+.12*Math.sin(seconds*.55);
 };
 const dispose=()=>{
  for(const geometry of ownedGeometry)geometry.dispose();
  for(const material of ownedMaterials)material.dispose();
  cloudMat.dispose();
  strata?.dispose();
  basalt.map=basalt.bumpMap=brokenStone.map=brokenStone.bumpMap=null;
  basalt.needsUpdate=brokenStone.needsUpdate=true;
  scene.remove(root);
 };
 return {update,dispose};
}
