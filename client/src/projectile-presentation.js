// Presentation-only dimensions in metres. No combat, targeting or item state.
const profile=(radius,length,width,head,stretch)=>Object.freeze({radius,length,width,head,stretch});
const styles=Object.freeze({
  vanguard:profile(.032,.46,.034,.12,1.7),
  surveyor:profile(.021,.58,.025,.10,2.3),
  keeper:profile(.029,.38,.036,.11,1.3),
  symbiotech:profile(.039,.32,.045,.105,1.1),
  mender:profile(.027,.36,.032,.105,1.3),
  hostile:profile(.034,.49,.038,.12,1.8),
  generic:profile(.027,.40,.034,.11,1.5),
});
export function projectileStyle(family){return Object.hasOwn(styles,family)?styles[family]:styles.generic;}
export function makeTracerGeometry(T){return new T.CylinderGeometry(.18,1,1,6,1,false);}
export function finiteVector(p){return !!p&&[p.x,p.y,p.z].every(Number.isFinite);}
// Tip follows confirmed flight; the tail stays between the source and the tip.
export function poseTracer(mesh,start,target,k,style,dir,up){
  if(!finiteVector(start)||!finiteVector(target)||!Number.isFinite(k)){mesh.visible=false;return false;}
  dir.subVectors(target,start);
  const len=dir.length(),tip=len*Math.min(1,Math.max(0,k));
  if(!Number.isFinite(len)||len<1e-5||tip<1e-5){mesh.visible=false;return false;}
  const tail=Math.min(style.length,tip);
  dir.multiplyScalar(1/len);
  mesh.position.copy(start).addScaledVector(dir,tip-tail*.5);
  mesh.quaternion.setFromUnitVectors(up,dir);
  mesh.scale.set(style.radius,tail,style.radius);
  mesh.visible=true;
  return true;
}
