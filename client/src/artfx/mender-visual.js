// Optional presentation component for the original carapace GLB.
// The supplied body is a caller-owned clone. Existing live makeMender is not replaced.
// All dynamic meshes here are owned by this component and explicitly disposed.
const MODES={triage:0x83d4a7,guard:0x82cce8,assist:0xefb36c,dormant:0x52616a};
export function menderPose({time=0,speed=0,cast=0,mode='triage',act='idle',reducedMotion=false}={}){
 if(![time,speed,cast].every(Number.isFinite)||time<0)throw Error('invalid Mender pose');
 const active=act==='mending'||act==='bonding'||act==='harrying',k=Math.min(1,Math.max(0,cast)),v=Math.min(1,Math.max(0,speed/6));
 const modeKey=act==='dormant'?'dormant':mode;
 const color=Object.hasOwn(MODES,modeKey)?MODES[modeKey]:MODES.triage;
 return {color,hover:reducedMotion?0:Math.sin(time*2.1)*.042,scale:act==='bonded'?.5:1,coreScale:1+(reducedMotion?0:Math.sin(time*(active?7:2.5))*(active?.12:.035))+k*.24,tendrils:Array.from({length:4},(_,i)=>({rootX:v*.5+(reducedMotion?0:Math.sin(time*2+i*1.5)*.16),rootZ:reducedMotion?0:Math.cos(time*1.8+i*1.4)*.15,midX:.23+(reducedMotion?0:Math.sin(time*2.6+i)*.23),tipX:.34+(reducedMotion?0:Math.cos(time*2.1+i)*.24)}))};
}
export function makeMenderVisual(THREE,body){
 if(!body?.isObject3D||body.parent)throw Error('a detached carapace instance is required');
 const group=new THREE.Group(),rig=new THREE.Group();group.add(rig);rig.add(body);
 const lensGeo=new THREE.SphereGeometry(1,12,8),lensMat=new THREE.MeshBasicMaterial({color:MODES.triage,toneMapped:false});
 const lens=new THREE.Mesh(lensGeo,lensMat);lens.position.set(0,0,.205);lens.scale.set(.045,.045,.019);rig.add(lens);
 const tubeMat=new THREE.MeshStandardMaterial({color:0x70565d,roughness:.76,metalness:.08});
 const tipMat=new THREE.MeshBasicMaterial({color:MODES.triage,toneMapped:false});
 const geometries=[new THREE.CylinderGeometry(.014,.021,.11,12),new THREE.CylinderGeometry(.010,.014,.085,12),new THREE.CylinderGeometry(.003,.010,.066,12),new THREE.SphereGeometry(.009,12,8),new THREE.SphereGeometry(.014,12,8)];
 const tendrils=[];
 for(let i=0;i<4;i++){
  const r=new THREE.Group(),mid=new THREE.Group(),tip=new THREE.Group();r.position.set((i-1.5)*.051,-.207,-.025+(i%2)*.045);r.add(mid);mid.position.y=-.11;mid.add(tip);tip.position.y=-.085;rig.add(r);
  for(const [j,p,len] of [[0,r,.11],[1,mid,.085],[2,tip,.066]]){const m=new THREE.Mesh(geometries[j],tubeMat);m.position.y=-len/2;p.add(m);}
  for(const [p,s] of [[mid,1],[tip,.72]]){const joint=new THREE.Mesh(geometries[4],tubeMat);joint.scale.setScalar(s);p.add(joint);}
  const dot=new THREE.Mesh(geometries[3],tipMat);dot.position.y=-.066;tip.add(dot);tendrils.push({r,mid,tip});
 }
 let done=false;
 function update(state){if(done)throw Error('Mender visual disposed');const p=menderPose(state);rig.position.y=p.hover;rig.scale.setScalar(p.scale);lensMat.color.setHex(p.color);tipMat.color.setHex(p.color);lens.scale.set(.045*p.coreScale,.045*p.coreScale,.019*p.coreScale);for(let i=0;i<tendrils.length;i++){const {r,mid,tip}=tendrils[i],a=p.tendrils[i];r.rotation.set(a.rootX,0,a.rootZ);mid.rotation.x=a.midX;tip.rotation.x=a.tipX;}return p;}
 function dispose(){if(done)return;done=true;rig.remove(body);for(const geo of [lensGeo,...geometries])geo.dispose();for(const mat of [lensMat,tubeMat,tipMat])mat.dispose();group.clear();group.removeFromParent();}
 return {group,update,dispose};
}
