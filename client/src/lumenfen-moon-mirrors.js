// One shared high-quality planar reflection target, retargeted to the nearest
// visible Lumenfen mirrorpool. Other ponds retain PBR/shimmer only.
// Clear moonlight is required; heavy rain stops perfect surface reflection.
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
 const geometries=[];
 let mirror=null;
 if(enabled){
   for(let i=0;i<Math.min(waters.length,FEN_POOLS.length);i++){
     const geo=waters[i].geometry.clone(),pos=geo.attributes.position;
     // The shaped source carries absolute world X/Z. Keep the shoreline
     // footprint but flatten the lens to the actual pond elevation.
     for(let j=0;j<pos.count;j++)pos.setY(j,0);
     geo.rotateX(Math.PI/2);geo.computeVertexNormals();geo.computeBoundingSphere();
     geometries.push({geo,waterY:fenHeight(FEN_POOLS[i].x,FEN_POOLS[i].z)+.115});
   }
   if(geometries.length){
     mirror=new Reflector(geometries[0].geo,{
       clipBias:.003,textureWidth:textureSize,textureHeight:textureSize,
       color:0xc7dfd7,multisample:0,
     });
     mirror.rotation.x=-Math.PI/2;mirror.position.y=geometries[0].waterY;
     mirror.name='lumenfen:moonlit-planar-reflection';
     mirror.visible=false;mirror.renderOrder=3;group.add(mirror);
   }
 }
 let active=-1;
 return {
   update(eye,phase,climate){
     const calm=moonAboveFen(phase)&&(climate?.rain??0)<.12;
     if(!mirror||!calm||!eye||!Number.isFinite(eye.x)||!Number.isFinite(eye.z)){
       if(mirror)mirror.visible=false;active=-1;return;
     }
     let nearest=-1,distSq=95*95;
     for(let i=0;i<geometries.length;i++){
       const p=FEN_POOLS[i],dx=p.x-eye.x,dz=p.z-eye.z,d=dx*dx+dz*dz;
       if(d<distSq){distSq=d;nearest=i;}
     }
     if(nearest<0){mirror.visible=false;active=-1;return;}
     if(nearest!==active){
       mirror.geometry=geometries[nearest].geo;
       mirror.position.y=geometries[nearest].waterY;
     }
     mirror.visible=true;active=nearest;
   },
   stats:()=>({poolMirrors:mirror?1:0,eligiblePools:geometries.length,
      activeMirror:active,textureSize:mirror?textureSize:0}),
   dispose(){
     if(mirror){mirror.visible=false;mirror.removeFromParent();
       mirror.getRenderTarget()?.dispose();mirror.material.dispose();mirror=null;}
     for(const g of geometries)g.geo.dispose();
     geometries.length=0;active=-1;
   }
 };
}