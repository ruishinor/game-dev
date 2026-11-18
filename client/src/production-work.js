// Portable fabrication presentation. Real hand bones and separate visible work
// props; no movement, item statistics or gameplay authority are changed.
import {solveArm} from './weapon-pose.js';
export function createProductionWork(T,inst){
 const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion();
 const find=n=>inst.getObjectByName(n);
 const arms=['r','l'].map(side=>({upper:find('upperarm_'+side),lower:find('lowerarm_'+side),hand:find('hand_'+side)}));
 const valid=arms.every(a=>a.upper&&a.lower&&a.hand);
 const saved=new Map();
 let right=null,left=null,method=null;
 const restorePose=()=>{for(const [bone,q] of saved)bone.quaternion.copy(q);saved.clear();if(valid)inst.updateWorldMatrix(true,true);};
 function free(group){
  if(!group)return;
  group.removeFromParent();
  const mats=new Set();group.traverse(o=>{if(o.isMesh){o.geometry.dispose();mats.add(o.material);}});
  for(const mat of mats)mat.dispose();
 }
 function build(next){
  free(right);free(left);method=next;
  const steel=new T.MeshStandardMaterial({color:0x777e76,roughness:.52,metalness:.54});
  const dark=new T.MeshStandardMaterial({color:0x303e3e,roughness:.79,metalness:.18});
  const resin=new T.MeshStandardMaterial({color:next==='culture'?0x8bb488:0xb39b73,roughness:.47,metalness:.22});
  const mesh=(parent,geo,mat,x,y,z)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;};
  right=new T.Group();right.name='production:right';
  left=new T.Group();left.name='production:left';
  // Tool grip, housing and nose; the different families use different forms.
  mesh(right,new T.BoxGeometry(.038,.045,.10),dark,0,0,.035);
  mesh(right,new T.BoxGeometry(.065,.055,next==='upgrade'?.13:.095),steel,0,0,.11);
  const tip=mesh(right,new T.CylinderGeometry(.012,.017,.08,8),resin,0,0,.20);tip.rotation.x=Math.PI/2;
  if(next==='culture'){
   mesh(left,new T.CylinderGeometry(.055,.055,.14,12),resin,0,.045,.025);
   for(const y of [-.035,.12])mesh(left,new T.CylinderGeometry(.061,.061,.022,12),steel,0,y,.025);
  }else{
   mesh(left,new T.BoxGeometry(next==='upgrade'?.19:.13,.075,.14),steel,0,.015,.035);
   mesh(left,new T.BoxGeometry(.085,.028,.076),resin,0,.065,.035);
   mesh(left,new T.BoxGeometry(.025,.085,.12),dark,-.055,.015,.035);
  }
  // Each group owns its own geometries; materials must not be disposed twice.
  // Both groups use these shared-in-this-instance materials, so clone per mesh.
  const all=new Set([steel,dark,resin]);
  for(const g of [right,left])g.traverse(o=>{if(o.isMesh)o.material=o.material.clone();});
  for(const mat of all)mat.dispose();
  arms[0].hand.add(right);arms[1].hand.add(left);
 }
 function clear(){
  if(saved.size)restorePose();
  if(right)right.visible=false;if(left)left.visible=false;
 }
 return {
  canPose(st){return valid&&!st.dead&&!st.air&&st.speed<.5&&['assemble','culture','upgrade'].includes(st.work?.m)&&Number.isFinite(st.work?.q);},
  restorePose,clear,
  pose(work,t,reduced=false){
   if(!valid)return;
   if(method!==work.m)build(work.m);
   for(const a of arms)for(const bone of [a.upper,a.lower,a.hand])saved.set(bone,bone.quaternion.clone());
   const r=arms[0],l=arms[1],ra=r.upper.getWorldPosition(V()),la=l.upper.getWorldPosition(V());
   const center=ra.clone().lerp(la,.5),side=ra.clone().sub(la).normalize(),forward=V(0,0,1).applyQuaternion(inst.getWorldQuaternion(Q()));
   const scale=inst.getWorldScale(V()).x,q=Math.max(0,Math.min(1,work.q));
   const working=q>=.20&&q<.83,inspect=q>=.83;
   const pulse=working&&!reduced?Math.sin(t*(work.m==='culture'?5:8))*.042:0;
   const drop=(inspect?.22:q<.20?.43:.34)*scale;
   const component=center.clone().addScaledVector(forward,.33*scale).addScaledVector(side,-.11*scale);component.y-=drop;
   const tool=center.clone().addScaledVector(forward,(.29+pulse)*scale).addScaledVector(side,(working?.09:.19)*scale);tool.y-=drop+(working?-.035:.04)*scale;
   const rw=solveArm(T,r.upper,r.lower,r.hand,tool,side.clone().add(V(0,-.9,0)));
   const lw=solveArm(T,l.upper,l.lower,l.hand,component,side.clone().negate().add(V(0,-.9,0)));
   if(!rw||!lw){clear();return;}
   const axis=lw.clone().sub(rw).addScaledVector(forward,.08*scale);
   if(axis.lengthSq()<1e-8)axis.copy(forward);axis.normalize();
   right.quaternion.copy(Q().setFromUnitVectors(V(0,0,1),axis)).premultiply(r.hand.getWorldQuaternion(Q()).invert());
   left.quaternion.copy(inst.getWorldQuaternion(Q())).premultiply(l.hand.getWorldQuaternion(Q()).invert());
   right.visible=left.visible=true;
  },
  dispose(){clear();free(right);free(left);right=left=null;}
 };
}
