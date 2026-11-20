// Reuse both existing fitted humanoid coat shells, without replacing the rig
// or changing the underlying loadout. A missing coat leaves the native look.
const COATS=Object.freeze({
  service:{color:0xb1a486,roughness:.91,metalness:0,map:'look_coat_panels'},
  relay:{color:0x31595b,roughness:.85,metalness:0,map:'look_coat_panels'}
});
export function createSocialTorso(THREE,assets,entries){
  const materials=new Map();
  const hasCoat=entries.some(e=>e.shell==='coat');
  let current=null;
  function apply(next){
    const key=hasCoat&&typeof next==='string'&&Object.hasOwn(COATS,next)?next:null;
    if(key===current)return;
    current=key;
    let material=materials.get(key);
    if(key&&!material){
      const spec=COATS[key];
      material=new THREE.MeshStandardMaterial({color:spec.color,roughness:spec.roughness,metalness:spec.metalness,side:THREE.DoubleSide});
      material.map=assets.texture(spec.map);materials.set(key,material);
    }
    for(const e of entries){
      const chosen=!!key&&e.shell==='coat';
      const visible=key?chosen:e.originalVisible;
      // a worn armour piece that replaces this shell keeps it hidden until removed
      if(e.mesh.userData.armourHides)e.mesh.userData.armourShown=visible;else e.mesh.visible=visible;
      e.mesh.material=chosen?material:e.original;
    }
  }
  return {apply,worn:()=>current,dispose(){apply(null);for(const m of materials.values())m.dispose();materials.clear();}};
}
