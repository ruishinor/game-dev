// Original Attunement hard-surface candidate. Units are game-space only.
// Pure presentation: no inventory, attack, damage or stun authority.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ROD = Object.freeze({ halfLength: .76, splitOffset: .27, duration: .95 });
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { x = clamp(x); return x*x*(3-2*x); };

// Rotate the off-hand half while there is clearance, then close the seam.
// Both directions use the same continuous path. Local +Y points to each tip.
export function rodPose(progress) {
  const p = clamp(progress), a = smooth(p/.66), b = smooth((p-.66)/.34);
  return {
    right: { x: ROD.splitOffset*(1-b), z: -.08*(1-a), angle: -.17*(1-a) },
    left: { x: -ROD.splitOffset*(1-b), z: .08*(1-a), angle: .17 + (Math.PI-.17)*a },
  };
}
const makeMaterial = (name, options) => {
  const m = new THREE.MeshStandardMaterial(options); m.name = name; return m;
};

function makeHalfGeometry() {
  const sections = new Map();
  function add(key, g) {
    // Merging requires consistent attributes/indexing across primitive types.
    const nonindexed = g.index ? g.toNonIndexed() : g;
    if (nonindexed !== g) g.dispose();
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key).push(nonindexed);
  }
  const profile = (key, points, segments = 32) =>
    add(key, new THREE.LatheGeometry(points.map(([y,r])=>new THREE.Vector2(r,y)),segments));
  const collar=(key,y,w,r)=>{
    profile(key,[[y-w/2,0],[y-w/2,r*.82],[y-w*.33,r],[y+w*.33,r],[y+w/2,r*.82],[y+w/2,0]]);
  };
  // Near-silhouette authored bevels, nested mechanical shoulders and recessed waist.
  profile('gunmetal',[[0,0],[0,.029],[.008,.038],[.032,.039],[.045,.032],
    [.205,.032],[.218,.037],[.245,.037],[.258,.028],[.294,.025],
    [.65,.025],[.676,.035],[.718,.036],[.746,.029],[.76,.022],[.76,0]]);
  profile('shaft',[[.258,0],[.258,.027],[.27,.029],[.647,.029],[.661,.025],[.661,0]]);
  profile('grip',[[.043,0],[.043,.033],[.055,.036],[.195,.036],[.211,.033],[.211,0]]);
  // Offset bands read as textile/rubber chevrons, rather than a smooth cylinder.
  for(let i=0;i<12;i++){
    const y=.057+i*.0122;
    collar(i%3===0?'steel':'gripRib',y,.007,.038);
  }
  for(const [y,w,r] of [[.011,.012,.039],[.034,.008,.04],[.219,.011,.041],
    [.244,.009,.039],[.278,.009,.033],[.65,.012,.035],[.679,.012,.041],
    [.704,.007,.039],[.739,.009,.033]]) collar('steel',y,w,r);
  for(const y of [.025,.235,.665,.691,.722]) collar('dark',y,.006,.0375);
  // Three narrow inlaid lanes and two staggered helixes follow the shaft.
  for(let i=0;i<3;i++){
    const a=i*Math.PI*2/3;
    const points=[];
    for(let j=0;j<=32;j++){
      const f=j/32, y=.289+f*.346, theta=a+f*.65;
      points.push(new THREE.Vector3(.0295*Math.cos(theta),y,.0295*Math.sin(theta)));
    }
    const curve=new THREE.CatmullRomCurve3(points);
    add('inlay',new THREE.TubeGeometry(curve,32,.0018,6,false));
  }
  for(let lane=0;lane<2;lane++){
    const points=[];
    for(let j=0;j<=96;j++){
      const f=j/96,theta=lane*Math.PI+f*Math.PI*4;
      points.push(new THREE.Vector3(.0302*Math.cos(theta),.302+f*.326,.0302*Math.sin(theta)));
    }
    add('blue',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),96,.0031,7,false));
  }
  // Recessed luminous channels terminate in a cage, with restrained solid emissive material.
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    const g=new THREE.BoxGeometry(.0048,.051,.010);
    g.rotateY(-a);g.translate(.032*Math.cos(a),.709,.032*Math.sin(a));add('steel',g);
    const b=new THREE.BoxGeometry(.0027,.031,.006);
    b.rotateY(-a);b.translate(.034*Math.cos(a+.23),.702,.034*Math.sin(a+.23));add('inlay',b);
  }
  collar('inlay',.731,.004,.0305);
  collar('blue',.748,.004,.027);
  const merged = new Map();
  for(const [key,geos] of sections){
    const geo=mergeGeometries(geos);geos.forEach(g=>g.dispose());
    if(!geo)throw Error('Failed to merge electrical rod '+key);
    geo.computeBoundingSphere();merged.set(key,geo);
  }
  return merged;
}

export function createElectricalRod() {
  const group=new THREE.Group();group.name='ElectricalCombatRod';
  const geometry=makeHalfGeometry();
  const mats={
    gunmetal:makeMaterial('Machined graphite',{color:0x29343e,metalness:.84,roughness:.33}),
    shaft:makeMaterial('Blue-black composite',{color:0x152b39,metalness:.67,roughness:.27}),
    grip:makeMaterial('Carbon elastomer',{color:0x20242a,metalness:.12,roughness:.8}),
    gripRib:makeMaterial('Grip ridges',{color:0x3c4146,metalness:.2,roughness:.67}),
    steel:makeMaterial('Brushed alloy',{color:0x687781,metalness:.9,roughness:.29}),
    dark:makeMaterial('Recess seals',{color:0x12191d,metalness:.38,roughness:.56}),
    blue:makeMaterial('Cobalt inlay',{color:0x1764aa,metalness:.47,roughness:.3,emissive:0x1464aa,emissiveIntensity:.29}),
    inlay:makeMaterial('Energy channel',{color:0x4fa1bc,metalness:.33,roughness:.24,emissive:0x41bde8,emissiveIntensity:.65}),
  };
  const halves=['RodRight','RodLeft'].map(name=>{
    const h=new THREE.Group();h.name=name;group.add(h);
    for(const [key,geo] of geometry){
      const mesh=new THREE.Mesh(geo,mats[key]);mesh.name=name+'_'+key;
      mesh.castShadow=true;mesh.receiveShadow=true;h.add(mesh);
    }
    for(const [n,y] of [['Coupler',0],['Grip',.13],['Tip',.75],['Channel',.59]]){
      const marker=new THREE.Object3D();marker.name=name+n;marker.position.y=y;h.add(marker);
    }
    return h;
  });
  let p=0,target=0,disposed=false;
  function apply(){
    const pose=rodPose(p);
    halves.forEach((h,i)=>{const v=i?pose.left:pose.right;h.position.set(v.x,0,v.z);h.rotation.set(0,0,v.angle);});
  }
  apply();
  function setMode(mode) {
    if(mode!=='dual'&&mode!=='rod')throw Error('Unknown rod presentation mode');
    target=mode==='rod'?1:0;
  }
  function update(dt,{reducedMotion=false,energized=true,activity=0}={}){
    if(disposed)return;
    const step=Number.isFinite(dt)&&dt>0?dt/ROD.duration:0;
    p=reducedMotion?target:p+Math.sign(target-p)*Math.min(Math.abs(target-p),step);
    apply();
    const k=energized?1:0;
    mats.inlay.emissiveIntensity=k*(.55+.38*clamp(Number.isFinite(activity)?activity:0));
    mats.blue.emissiveIntensity=k*.24;
  }
  function anchor(i,name,into=new THREE.Vector3()){
    const h=halves[i];if(!h)throw Error('Unknown rod half');
    const marker=h.getObjectByName(h.name+name);if(!marker)throw Error('Unknown rod anchor');
    return marker.getWorldPosition(into);
  }
  return {group,halves,setMode,update,anchor,get progress(){return p;},
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();
      geometry.forEach(g=>g.dispose());Object.values(mats).forEach(m=>m.dispose());}};
}

// Joined field configuration. Grip is centered at the supplied palm in the
// hand's local frame; existing character animation drives the attachment.
export function createHeldElectricalRod(hand,{axis=new THREE.Vector3(0,0,1),palm=new THREE.Vector3(),offHand=null,offAxis=new THREE.Vector3(0,0,1),offPalm=new THREE.Vector3()}={}){
  const rod=createElectricalRod();
  rod.setMode('rod');rod.update(0,{reducedMotion:true});
  rod.group.name='HeldElectricalCombatRod';
  rod.group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis.clone().normalize());
  rod.group.position.copy(palm).sub(new THREE.Vector3(0,.13,0).applyQuaternion(rod.group.quaternion));
  hand.add(rod.group);
  // Both halves stay in a single rig. In dual mode the off-hand half is
  // driven by the live palm transform, converted into the right-hand root.
  // No reparenting, so an in-flight reversal has no discontinuity.
  const [right,left]=rod.halves;
  const baseUpdate=rod.update;
  const qOff=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),offAxis.clone().normalize());
  const qWorld=new THREE.Quaternion(),qRoot=new THREE.Quaternion(),qLocal=new THREE.Quaternion(),qJoined=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI);
  const seam=new THREE.Vector3(),offset=new THREE.Vector3(),grip=new THREE.Vector3(0,.13,0);
  rod.update=(dt,opts={})=>{
    baseUpdate(dt,opts);
    right.position.set(0,0,0);right.quaternion.identity();
    if(!offHand){left.position.set(0,0,0);left.quaternion.copy(qJoined);return;}
    offHand.updateWorldMatrix(true,false);rod.group.updateWorldMatrix(true,false);
    offHand.getWorldQuaternion(qWorld).multiply(qOff);
    rod.group.getWorldQuaternion(qRoot).invert();
    qLocal.copy(qRoot).multiply(qWorld);
    seam.copy(offPalm);offHand.localToWorld(seam);rod.group.worldToLocal(seam);
    seam.sub(offset.copy(grip).applyQuaternion(qLocal));
    const k=smooth(rod.progress);
    left.position.copy(seam).multiplyScalar(1-k);
    left.quaternion.copy(qLocal).slerp(qJoined,k);
  };
  rod.update(0,{reducedMotion:true});
  return rod;
}

// Existing Attunement lightning pool. No scene light, full-shaft aura or projectile.
// Short local pulses follow actual mesh nodes, including during a transform.
export function createElectricalRodVfx(rod,vfx) {
  let cooldown=0;
  return {
    update(dt,{energized=true,activity=0}={}){
      if(!Number.isFinite(dt)||dt<0)return;
      cooldown=Math.max(0,cooldown-dt);
      if(!vfx||vfx.quality<=0||vfx.reducedMotion||!energized||cooldown>0)return;
      cooldown=activity>.25?.18:.48;
      for(let i=0;i<2;i++){
        vfx.lightning({from:()=>rod.anchor(i,'Channel'),to:()=>rod.anchor(i,'Tip'),
          color:0x74d6ef,color2:0x258ad5,width:.009,life:.17,jag:.14,
          alpha:activity>.25?.63:.34,branches:activity>.25?1:0});
      }
    },
    impact(at){if(!vfx||vfx.quality<=0)return;
      vfx.burst({at,count:9,color:0xc4f4ff,color2:0x438edf,cell:13,life:.23,
        size:.038,speed:[.3,1.5],drag:3});}
  };
}
