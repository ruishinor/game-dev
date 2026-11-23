// Independent, organic biome built on the Expanse's shared-authority principles,
// not its rock kit: liquid basins, rootglass canopy, fungal understorey and mist.
import {LUMENFEN,FEN_TREES,FEN_POOLS,fenHeight,inLumenfen} from '../../shared/lumenfen.js';
import {buildLumenfenSites} from './lumenfen-sites.js';
import {buildLumenfenEcology} from './lumenfen-ecology.js';
import {buildLumenfenMoonMirrors,moonAboveFen} from './lumenfen-moon-mirrors.js';
import {buildFenMonsoonBloom,createFenMonsoonFx} from './lumenfen-monsoon.js';
export function buildLumenfenWorld(T,scene,{sky,ambient,sun,detail=1,reducedMotion=()=>false}={}){
 const P=LUMENFEN,group=new T.Group();group.name='lumenfen:landscape';group.visible=false;scene.add(group);
 const soil=new T.MeshStandardMaterial({vertexColors:true,roughness:.95});
 const w=(P.hw+35)*2,d=(P.hd+35)*2;
 const floor=new T.PlaneGeometry(w,d,155,175);floor.rotateX(-Math.PI/2);floor.translate(P.x,0,P.z);
 const a=floor.attributes.position,colors=[];
 const c=new T.Color();
 for(let i=0;i<a.count;i++){
  const x=a.getX(i),z=a.getZ(i),h=fenHeight(x,z);a.setY(i,h);
  const low=h<-.13,alt=Math.sin(x*.16+z*.09)*.16+Math.cos(z*.11)*.13;
  c.setHSL(low?.48:.37,low?.18:.28,Math.max(.11,Math.min(.33,(low?.18:.23)+alt*.13)));
  colors.push(c.r,c.g,c.b);
 }
 floor.setAttribute('color',new T.Float32BufferAttribute(colors,3));floor.computeVertexNormals();
 const mesh=new T.Mesh(floor,soil);mesh.receiveShadow=true;group.add(mesh);
 // Heterogeneous flora, noncircular marsh water and terrain-following banks.
 // The authoritative tree footprints and terrain remain unchanged.
 const ecology=buildLumenfenEcology(T,group,{
   center:P,trees:FEN_TREES,pools:FEN_POOLS,height:fenHeight,detail
 });
 const sites=buildLumenfenSites(T);group.add(sites.group);
 const moonMirrors=buildLumenfenMoonMirrors(T,group,{detail,textureSize:detail>=2?768:512});
 const monsoonBloom=buildFenMonsoonBloom(T,group);
 const waterMaterial=group.children.find(o=>o.name==='lumenfen:mirrorpool')?.material;
 const glowLight=new T.PointLight(0x64ba9e,3.0,34,2);glowLight.position.set(P.x+20,7,P.z-22);group.add(glowLight);
 let prior=null,clock=0,climate=null,monsoonFx=null;
 const moon=sky?.children?.find(o=>o.isMesh&&o.geometry?.type==='SphereGeometry'&&o.geometry?.parameters?.radius===9)||null;
 const active=eye=>!!eye&&inLumenfen(eye.x,eye.z,35);
 return {
  group,
  setClimate(state){climate=state&&Number.isFinite(state.rain)&&Number.isFinite(state.phase)?state:null;},
  attachVfx(vfx){monsoonFx?.dispose();monsoonFx=vfx?createFenMonsoonFx(vfx):null;},
  stats:()=>({trees:FEN_TREES.length,pools:FEN_POOLS.length,spores:ecology.stats().spores,
    landmarks:sites.stats(),ecology:ecology.stats(),
    monsoon:monsoonBloom.stats(),mirrors:moonMirrors.stats()}),
  update(dt,t,eye){
   const inside=active(eye);group.visible=inside;
   if(inside){
    if(!prior){prior={fog:scene.fog?{color:scene.fog.color.getHex(),near:scene.fog.near,far:scene.fog.far}:null,
       sky:sky?.position.clone(),moonVisible:moon?.visible,ambient:ambient?.intensity,sun:sun?.intensity};}
    if(scene.fog){scene.fog.color.setHex(0x1d3436);scene.fog.near=36;scene.fog.far=200;}
    if(ambient)ambient.intensity=.85;if(sun)sun.intensity=1.1;
    if(sky)sky.position.set(eye.x,0,eye.z);
    if(moon)moon.visible=moonAboveFen(climate?.phase)&&(climate?.rain??0)<.55;
    clock+=Math.max(0,dt||0);
    sites.update(dt,typeof reducedMotion==='function' ? reducedMotion() : !!reducedMotion);
    ecology.update(clock,typeof reducedMotion==='function' ? reducedMotion() : !!reducedMotion);
    // Weather is interpolated from a server-published climate state, and
    // never touches authoritative movement, collision or enemy simulation.
    monsoonBloom.update(climate);
    moonMirrors.update(eye,climate?.phase,climate);
    const rain=climate?.rain??0;
    soil.roughness=.95-rain*.29;
    if(waterMaterial){
      waterMaterial.roughness=.045+rain*.30;
      waterMaterial.clearcoatRoughness=.035+rain*.25;
    }
    monsoonFx?.update(dt,eye,climate,
      typeof reducedMotion==='function'?reducedMotion():!!reducedMotion);
   }else if(prior){
    moonMirrors.update(null,null,null);
    monsoonBloom.update(null);
    if(moon&&prior.moonVisible!==undefined)moon.visible=prior.moonVisible;
    if(prior.fog&&scene.fog){scene.fog.color.setHex(prior.fog.color);scene.fog.near=prior.fog.near;scene.fog.far=prior.fog.far;}
    if(sky&&prior.sky)sky.position.copy(prior.sky);
    if(moon&&prior.moonVisible!==undefined)moon.visible=prior.moonVisible;
    if(ambient&&Number.isFinite(prior.ambient))ambient.intensity=prior.ambient;
    if(sun&&Number.isFinite(prior.sun))sun.intensity=prior.sun;
    prior=null;
   }
  },
  dispose(){
   monsoonFx?.dispose();moonMirrors.dispose();monsoonBloom.dispose();
   sites.dispose();ecology.dispose();
   floor.dispose();soil.dispose();
   group.removeFromParent();
  }
 };
}
