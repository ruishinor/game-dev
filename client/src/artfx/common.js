import { fieldMaterial } from './field-material.js';
// Presentation-only VFX. All timing, hits and gameplay state are caller-owned.
const finite=Number.isFinite;
export const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
export const add=(a,b)=>a.map((x,i)=>x+b[i]);
export const sub=(a,b)=>a.map((x,i)=>x-b[i]);
export const scale=(a,k)=>a.map(x=>x*k);
export const magnitude=a=>Math.hypot(...a);
export function vec3(v){if(!Array.isArray(v)||v.length!==3||!v.every(finite)||v.some(x=>Math.abs(x)>100000))throw Error('invalid effect vector');return [...v];}
export function positive(x,max=100){if(!finite(x)||x<=0||x>max)throw Error('invalid effect dimension');return x;}
export function unit(v){v=vec3(v);const l=magnitude(v);if(l<1e-6)throw Error('zero direction');return scale(v,1/l);}
export function timing(t,duration,reduced=false){
 positive(duration,120);if(!finite(t))throw Error('invalid effect time');if(t<0||t>=duration)return null;
 const p=t/duration,fade=Math.min(clamp(p/.10),clamp((1-p)/.18));
 return {p,fade,pulse:reduced?1:1+.045*Math.sin(t*6)};
}
// Shared geometry contract for the linked field and its perimeter. Coordinates in metres.
export function spanPoint(a,b,height,bow,u,v){
 const dx=b[0]-a[0],dz=b[2]-a[2],w=Math.hypot(dx,dz),s=Math.sin(Math.PI*u);
 return [a[0]+dx*u-dz/w*bow*s,a[1]+(b[1]-a[1])*u+.12+v*(height-.12+bow*.45*s),a[2]+dz*u+dx/w*bow*s];
}
export function validateFrame(frame){
 if(!Array.isArray(frame)||frame.length>64)throw Error('invalid effect frame size');const ids=new Set();
 for(const o of frame){
  if(typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{1,40}$/.test(o.id)||ids.has(o.id))throw Error('invalid/duplicate effect id');ids.add(o.id);
  if(!['hemisphere','sphere','ring','panel','span','spanEdge','beam','point'].includes(o.type))throw Error('invalid effect kind');
  if(!Number.isInteger(o.color)||o.color<0||o.color>0xffffff||!finite(o.opacity)||o.opacity<0||o.opacity>1)throw Error('invalid effect material');
  if(o.surface!==undefined&&(o.surface!=='field'||!['panel','hemisphere','span'].includes(o.type)))throw Error('invalid field surface');
  if(o.motion!==undefined&&typeof o.motion!=='boolean')throw Error('invalid motion');
  if(o.type==='beam'){vec3(o.a);vec3(o.b);positive(magnitude(sub(o.b,o.a)),100);positive(o.radius,2);}
  else if(o.type==='span'||o.type==='spanEdge'){vec3(o.a);vec3(o.b);positive(Math.hypot(o.b[0]-o.a[0],o.b[2]-o.a[2]),100);if(Math.hypot(o.b[0]-o.a[0],o.b[2]-o.a[2])<.25)throw Error('span too narrow');positive(o.height,100);if(o.height<=.12||!finite(o.bow)||o.bow<0||o.bow>2||(o.type==='span'?o.surface!=='field':![0,1].includes(o.edge)))throw Error('invalid span shape');}
  else {vec3(o.at);if(o.type==='panel'){positive(o.width,100);positive(o.height,100);unit(o.normal);}
   else {positive(o.radius,100);if(o.type==='ring'){unit(o.normal);positive(o.arc??Math.PI*2,Math.PI*2);positive(o.tube??.012,.2);}}}
 }
 return frame;
}
// Inject THREE (browser import map or node package). Own all allocated resources.
// Geometry IDs must remain type-compatible across frames. Never drives simulation.
export function createArtEffect(THREE,sample){
 if(typeof sample!=='function')throw Error('sample function required');
 const group=new THREE.Group(),pool=new Map();let disposed=false;
 const up=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(0,0,1);
 const key=o=>[o.type,o.arc??Math.PI*2,o.tube??.012,!!o.wireframe,o.surface??'basic',o.motion!==false,['span','spanEdge'].includes(o.type)?JSON.stringify([o.a,o.b,o.height,o.bow,o.edge??null]):''].join('|');
 function make(o){
  let geometry;
  if(o.type==='sphere'||o.type==='point')geometry=new THREE.SphereGeometry(1,o.type==='point'?8:24,o.type==='point'?6:12);
  else if(o.type==='hemisphere')geometry=new THREE.SphereGeometry(1,32,12,0,Math.PI*2,0,Math.PI/2);
  else if(o.type==='ring')geometry=new THREE.TorusGeometry(1,o.tube??.012,6,48,o.arc??Math.PI*2);
  else if(o.type==='panel')geometry=new THREE.PlaneGeometry(1,1);
  else if(o.type==='span'){
   const p=[],uv=[],idx=[],cols=16,rows=6;
   for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){const u=i/cols,v=j/rows;p.push(...spanPoint(o.a,o.b,o.height,o.bow,u,v));uv.push(u,v);}
   for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const a=j*(cols+1)+i,b=a+1,c=a+cols+2,d=c-1;idx.push(a,b,c,a,c,d);}
   geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(idx);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  }
  else if(o.type==='spanEdge'){
   // A single sampled tube replaces sixteen separate draw calls per edge.
   class EdgeCurve extends THREE.Curve {
    getPoint(t,target=new THREE.Vector3()){return target.set(...spanPoint(o.a,o.b,o.height,o.bow,t,o.edge));}
   }
   geometry=new THREE.TubeGeometry(new EdgeCurve(),16,.014,6,false);
  }
  else geometry=new THREE.CylinderGeometry(1,1,1,6,1,true);
  const material=o.surface==='field'?fieldMaterial(THREE,o):new THREE.MeshBasicMaterial({color:o.color,transparent:true,opacity:o.opacity,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,wireframe:!!o.wireframe,toneMapped:false});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=3;group.add(mesh);return {mesh,key:key(o)};
 }
 function update(t){
  if(disposed)throw Error('effect disposed');
  const frame=validateFrame(sample(t));for(const o of frame){const e=pool.get(o.id);if(e&&e.key!==key(o))throw Error('effect id geometry changed');}
  const incoming=frame.filter(o=>!pool.has(o.id)).length;if(pool.size+incoming>64)throw Error('effect pool limit');
  for(const e of pool.values())e.mesh.visible=false;
  for(const o of frame){
   let e=pool.get(o.id);if(!e){e=make(o);pool.set(o.id,e);}
   const m=e.mesh;m.visible=o.opacity>0;if(m.material.isShaderMaterial){const u=m.material.uniforms;u.tint.value.setHex(o.color);u.alpha.value=o.opacity;u.phase.value=t;if(o.type==='span')u.extent.value.set(Math.hypot(o.b[0]-o.a[0],o.b[2]-o.a[2]),o.height);else u.extent.value.set(o.type==='panel'?o.width:o.radius*3.14,o.type==='panel'?o.height:o.radius*1.57);}else{m.material.color.setHex(o.color);m.material.opacity=o.opacity;}m.quaternion.identity();
   if(o.type==='beam'){
    const a=new THREE.Vector3(...o.a),b=new THREE.Vector3(...o.b),d=b.clone().sub(a);
    m.position.copy(a).add(b).multiplyScalar(.5);m.scale.set(o.radius,d.length(),o.radius);m.quaternion.setFromUnitVectors(up,d.normalize());
   }else if(o.type==='span'||o.type==='spanEdge'){
    m.position.set(0,0,0);m.scale.setScalar(1);
   }else{
    m.position.set(...o.at);
    if(o.type==='panel')m.scale.set(o.width,o.height,1);else m.scale.setScalar(o.radius);
    if(o.type==='panel'||o.type==='ring')m.quaternion.setFromUnitVectors(forward,new THREE.Vector3(...unit(o.normal)));
   }
  }
  return frame.length;
 }
 function dispose(){if(disposed)return;disposed=true;for(const {mesh} of pool.values()){mesh.geometry.dispose();mesh.material.dispose();}pool.clear();group.clear();group.removeFromParent();}
 return {group,update,dispose,get allocated(){return pool.size;}};
}
