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
export function validateFrame(frame){
 if(!Array.isArray(frame)||frame.length>64)throw Error('invalid effect frame size');const ids=new Set();
 for(const o of frame){
  if(typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{1,40}$/.test(o.id)||ids.has(o.id))throw Error('invalid/duplicate effect id');ids.add(o.id);
  if(!['hemisphere','sphere','ring','panel','beam','point'].includes(o.type))throw Error('invalid effect kind');
  if(!Number.isInteger(o.color)||o.color<0||o.color>0xffffff||!finite(o.opacity)||o.opacity<0||o.opacity>1)throw Error('invalid effect material');
  if(o.type==='beam'){vec3(o.a);vec3(o.b);positive(magnitude(sub(o.b,o.a)),100);positive(o.radius,2);}
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
 const key=o=>[o.type,o.arc??Math.PI*2,o.tube??.012,!!o.wireframe].join('|');
 function make(o){
  let geometry;
  if(o.type==='sphere'||o.type==='point')geometry=new THREE.SphereGeometry(1,o.type==='point'?8:24,o.type==='point'?6:12);
  else if(o.type==='hemisphere')geometry=new THREE.SphereGeometry(1,32,12,0,Math.PI*2,0,Math.PI/2);
  else if(o.type==='ring')geometry=new THREE.TorusGeometry(1,o.tube??.012,6,48,o.arc??Math.PI*2);
  else if(o.type==='panel')geometry=new THREE.PlaneGeometry(1,1);
  else geometry=new THREE.CylinderGeometry(1,1,1,6,1,true);
  const material=new THREE.MeshBasicMaterial({color:o.color,transparent:true,opacity:o.opacity,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,wireframe:!!o.wireframe,toneMapped:false});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=3;group.add(mesh);return {mesh,key:key(o)};
 }
 function update(t){
  if(disposed)throw Error('effect disposed');
  const frame=validateFrame(sample(t));for(const o of frame){const e=pool.get(o.id);if(e&&e.key!==key(o))throw Error('effect id geometry changed');}
  const incoming=frame.filter(o=>!pool.has(o.id)).length;if(pool.size+incoming>64)throw Error('effect pool limit');
  for(const e of pool.values())e.mesh.visible=false;
  for(const o of frame){
   let e=pool.get(o.id);if(!e){e=make(o);pool.set(o.id,e);}
   const m=e.mesh;m.visible=o.opacity>0;m.material.color.setHex(o.color);m.material.opacity=o.opacity;m.quaternion.identity();
   if(o.type==='beam'){
    const a=new THREE.Vector3(...o.a),b=new THREE.Vector3(...o.b),d=b.clone().sub(a);
    m.position.copy(a).add(b).multiplyScalar(.5);m.scale.set(o.radius,d.length(),o.radius);m.quaternion.setFromUnitVectors(up,d.normalize());
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
