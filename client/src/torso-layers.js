// Use existing fitted, skinned chest/coat shells on both humanoid frames.
const chest=Object.freeze({
 field:{color:0x62756a,roughness:.83,metalness:.08,map:'look_plate_panels'},
 reinforced:{color:0x808e91,roughness:.54,metalness:.48,map:'look_plate_panels'},
 resonant:{color:0x615979,roughness:.45,metalness:.56,map:'look_plate_panels'}
});
const social=Object.freeze({
 service:{color:0xb1a486,roughness:.91,metalness:0,map:'look_coat_panels'},
 relay:{color:0x31595b,roughness:.85,metalness:0,map:'look_coat_panels'}
});
export function createTorsoLayers(THREE,assets,entries){
 const materials=new Map();let current='';
 function apply(cv,sv){
  const coat=Object.hasOwn(social,sv),armor=Object.hasOwn(chest,cv);
  const key=coat?'social:'+sv:armor?'chest:'+cv:'';
  if(current===key)return;current=key;
  let material=materials.get(key);
  if(key&&!material){
   const spec=coat?social[sv]:chest[cv];
   material=new THREE.MeshStandardMaterial({color:spec.color,roughness:spec.roughness,metalness:spec.metalness,side:THREE.DoubleSide});
   material.map=assets.texture(spec.map);materials.set(key,material);
  }
  for(const e of entries){
   const chosen=(coat&&e.shell==='coat')||(!coat&&armor&&e.shell==='chest');
   e.mesh.visible=key?chosen:e.originalVisible;
   e.mesh.material=chosen?material:e.original;
  }
 }
 return {apply,dispose(){apply();for(const mat of materials.values())mat.dispose();materials.clear();}};
}
