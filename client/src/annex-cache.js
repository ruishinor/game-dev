// Null Chamber cache: a distinct containment treatment on the already
// integrated source-derived GLB chassis, not a primitive placeholder box.
import { makeDepthsRecoveryCache } from './depths-cache.js';

export function makeAnnexRecoveryCache(T, loader) {
  const base=makeDepthsRecoveryCache(T,loader);
  const group=base.group;
  group.name='annex:null-recovery-cache';
  const geo=[],mats=[];
  const makeMat=(color,emissive=0,emissiveIntensity=0)=>{
    const m=new T.MeshStandardMaterial({color,roughness:.41,metalness:.62,emissive,emissiveIntensity});
    mats.push(m);return m;
  };
  const basalt=makeMat(0x242034),silver=makeMat(0x8991a9),
    energy=makeMat(0x8c82c5,0x7049d2,1.9);
  const add=(g,m,x,y,z,name)=>{
    const mesh=new T.Mesh(g,m);
    mesh.name=name;mesh.position.set(x,y,z);mesh.castShadow=true;
    mesh.receiveShadow=true;group.add(mesh);geo.push(g);return mesh;
  };
  // The violet assembly distinguishes the annex quarantine cache from the
  // Foundry survey cache. It retains the source-derived GLB as the central body.
  for(const side of [-1,1]){
    add(new T.BoxGeometry(.06,.58,1.08),silver,side*.88,.48,0,'annex-cache:armour-chevron');
    add(new T.BoxGeometry(.025,.042,.82),energy,side*.93,.76,0,'annex-cache:powered-seam');
    for(const z of [-.29,.29]){
      const spear=add(new T.CylinderGeometry(.038,.08,.34,9),basalt,side*.81,.87,z,'annex-cache:lock-post');
      spear.rotation.z=side*.25;
    }
  }
  const cradle=add(new T.TorusGeometry(.29,.046,9,32),silver,0,.91,0,'annex-cache:containment-collar');
  cradle.rotation.x=Math.PI/2;
  const crystal=add(new T.OctahedronGeometry(.18,1),energy,0,1.06,0,'annex-cache:quarantine-sensor');
  const marker=add(new T.RingGeometry(.73,.82,40),energy,0,.026,0,'annex-cache:perimeter-sigil');
  marker.rotation.x=-Math.PI/2;
  const ribs=[];
  for(let i=0;i<6;i++){
    const a=2*Math.PI*i/6;
    const n=add(new T.BoxGeometry(.035,.018,.34),silver,
      Math.sin(a)*.58,.86,Math.cos(a)*.35,'annex-cache:guarded-contact');
    n.rotation.y=a;ribs.push(n);
  }
  return {
    ...base,group,height:1.25,radius:.93,
    update(dt,state={}){
      base.update(dt,state);
      const pulse=state.reducedMotion?1:.78+.22*Math.sin((state.t||0)*1.35);
      energy.emissiveIntensity=1.7*pulse;
      crystal.rotation.y=state.reducedMotion?0:(state.t||0)*.32;
    },
    dispose(){
      base.dispose();
      for(const g of geo)g.dispose();
      for(const m of mats)m.dispose();
    },
  };
}
