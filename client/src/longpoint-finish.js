// One blackened finish for every runtime instance of the original Longpoint.
// Linear RGB reflectance, not an unlit black silhouette. Keep normal, ORM,
// surface maps and luminous optics; never tint shared donor materials.
const BLACK=Object.freeze({
 gunmetal:[.038,.043,.048],graphite:[.021,.025,.029],polymer:[.019,.021,.024],
 edge:[.075,.080,.086],recess:[.009,.011,.013],label:[.065,.069,.072],
 ceramic:[.027,.032,.036],seal:[.012,.014,.016],accent:[.045,.048,.052],pale:[.080,.085,.090]
});
export function applyLongpointBlackFinish(root){
 const clones=new Map();
 const paint=m=>{
   if(!m||!Object.hasOwn(BLACK,m.name)||!m.color?.setRGB)return m;
   if(m.userData?.longpointBlack)return m;
   if(clones.has(m))return clones.get(m);
   const clone=m.clone();clone.isShared=false;clone.color.setRGB(...BLACK[m.name]);
   clone.userData={...clone.userData,longpointBlack:true};
   clones.set(m,clone);return clone;
 };
 root.traverse(o=>{if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(paint):paint(o.material);});
 return root;
}
