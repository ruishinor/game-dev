// One high-quality true planar scene reflection at a time, assigned to the
// nearest visible Lumenfen mirrorpool during clear moonlit nights.
// Reflectors are deliberately excluded during monsoon downpours; rough wet
// water is a different physical state from a glass-still night.
import { Reflector } from 'three/addons/objects/Reflector.js';
import { FEN_POOLS, fenHeight } from '../../shared/lumenfen.js';

export function moonAboveFen(phase){
  if(!Number.isFinite(phase))return false;
  const p=((phase%1)+1)%1;
  return p>=.39&&p<=.61;
}
export function buildLumenfenMoonMirrors(T,group,{detail=1,textureSize=512}={}){
  const waters=group.children.filter(o=>o.name==='lumenfen:mirrorpool');
  const enabled=detail>=.75;
  const reflections=[];
  if(enabled)for(let i=0;i<Math.min(waters.length,FEN_POOLS.length);i++){
    const source=waters[i],pool=FEN_POOLS[i];
    const waterY=fenHeight(pool.x,pool.z)+.09;
    const geo=source.geometry.clone();
    // The source vertices contain world-space X, Y and Z. Flatten only
    // their tiny local ripples and place the reflection plane at the actual
    // pond's surface elevation, not the global origin.
    const pos=geo.attributes.position;
    for(let v=0;v<pos.count;v++)pos.setY(v,0);
    geo.rotateX(Math.PI/2);
    const mirror=new Reflector(geo,{
      clipBias:.003,textureWidth:textureSize,textureHeight:textureSize,
      color:0xc7dfd7,multisample:0,
    });
    mirror.rotation.x=-Math.PI/2;
    mirror.position.y=waterY+.025;
    mirror.name='lumenfen:moonlit-planar-reflection';
    mirror.visible=false;mirror.renderOrder=3;
    group.add(mirror);reflections.push(mirror);
  }
  let active=-1;
  return {
    update(eye,phase,climate){
      const calm=moonAboveFen(phase)&&(climate?.rain??0)<.12;
      if(!enabled||!calm||!eye||!Number.isFinite(eye.x)||!Number.isFinite(eye.z)){
        for(const m of reflections)m.visible=false;active=-1;return;
      }
      let nearest=-1,closest=95*95;
      for(let i=0;i<reflections.length;i++){
        const p=FEN_POOLS[i],dx=eye.x-p.x,dz=eye.z-p.z,d=dx*dx+dz*dz;
        if(d<closest){closest=d;nearest=i;}
      }
      for(let i=0;i<reflections.length;i++)reflections[i].visible=i===nearest;
      active=nearest;
    },
    stats:()=>({poolMirrors:reflections.length,activeMirror:active,textureSize:enabled?textureSize:0}),
    dispose(){
      for(const m of reflections){
        m.visible=false;m.removeFromParent();m.getRenderTarget()?.dispose();
        m.geometry.dispose();m.material.dispose();
      }
      reflections.length=0;active=-1;
    }
  };
}
