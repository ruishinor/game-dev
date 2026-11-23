// Independent, organic biome built on the Expanse's shared-authority principles,
// not its rock kit: liquid basins, rootglass canopy, fungal understorey and mist.
import {LUMENFEN,FEN_TREES,FEN_POOLS,fenHeight,inLumenfen} from '../../shared/lumenfen.js';
import {buildLumenfenSites} from './lumenfen-sites.js';
import {buildLumenfenEcology} from './lumenfen-ecology.js';
import {buildLumenfenMoonMirrors,moonAboveFen} from './lumenfen-moon-mirrors.js';
import {buildFenMonsoonBloom,createFenMonsoonFx} from './lumenfen-monsoon.js';
// The server publishes one integer world-clock phase (0..9999) in player snapshots.
// This palette is deliberately distinct from the Severance Expanse: tidal haze,
// legible marsh vegetation, cool lunar fill and bounded low-light bioluminescence.
const FEN_LIGHT_KEYS = Object.freeze([
 {fog:0x294d49,near:43,far:220,skyTop:0x173536,skyMid:0x49746b,skyLow:0x89977a,
  sun:0xd9eac7,sunI:1.18,hemiSky:0xa7c8b2,hemiGround:0x345c4c,hemiI:.95,glow:2.5},
 {fog:0x233d43,near:36,far:185,skyTop:0x142933,skyMid:0x3d555c,skyLow:0x806f63,
  sun:0xe3c3aa,sunI:.83,hemiSky:0x8ca9ac,hemiGround:0x2d4a45,hemiI:.77,glow:3.1},
 {fog:0x162b35,near:30,far:160,skyTop:0x071521,skyMid:0x193642,skyLow:0x31564e,
  sun:0x9ac4d2,sunI:.38,hemiSky:0x779da6,hemiGround:0x203e3d,hemiI:.60,glow:4.0},
 {fog:0x264b49,near:38,far:200,skyTop:0x112d34,skyMid:0x406661,skyLow:0x899083,
  sun:0xcfdfc1,sunI:.94,hemiSky:0x9eb7ae,hemiGround:0x33534b,hemiI:.85,glow:2.9}
]);
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
 const skyUniforms=sky?.children.find(o=>o.material?.uniforms?.top)?.material?.uniforms;
 const lightKeys=FEN_LIGHT_KEYS.map(key=>{
   const next={...key};
   for(const field of ['fog','skyTop','skyMid','skyLow','sun','hemiSky','hemiGround'])
     next[field]=new T.Color(key[field]);
   return next;
 });
 const sampled={
   fog:new T.Color(),skyTop:new T.Color(),skyMid:new T.Color(),skyLow:new T.Color(),
   sun:new T.Color(),hemiSky:new T.Color(),hemiGround:new T.Color()
 };
 const restore=()=>{
   if(!prior)return;
   if(prior.fog&&scene.fog){
     scene.fog.color.copy(prior.fog.color);scene.fog.near=prior.fog.near;scene.fog.far=prior.fog.far;
   }
   if(sky&&prior.sky)sky.position.copy(prior.sky);
   if(moon&&prior.moonVisible!==undefined)moon.visible=prior.moonVisible;
   if(skyUniforms&&prior.skyColors)
     for(const field of ['top','mid','low'])skyUniforms[field].value.copy(prior.skyColors[field]);
   if(ambient){
     if(prior.ambientSky)ambient.color.copy(prior.ambientSky);
     if(prior.ambientGround)ambient.groundColor.copy(prior.ambientGround);
     if(Number.isFinite(prior.ambient))ambient.intensity=prior.ambient;
   }
   if(sun){
     if(prior.sunColor)sun.color.copy(prior.sunColor);
     if(Number.isFinite(prior.sun))sun.intensity=prior.sun;
   }
   prior=null;
 };
 const setClockLighting=(worldClock)=>{
   if(!Number.isFinite(worldClock)){
     if(scene.fog){scene.fog.color.setHex(0x1d3436);scene.fog.near=36;scene.fog.far=200;}
     if(ambient)ambient.intensity=.85;
     if(sun)sun.intensity=1.1;
     glowLight.intensity=3;
     return;
   }
   const phase=((worldClock%10000)+10000)%10000/10000;
   const v=phase*4,i=Math.floor(v),f=v-i,e=f*f*(3-2*f);
   const a=lightKeys[i],b=lightKeys[(i+1)%4];
   for(const field of Object.keys(sampled))sampled[field].copy(a[field]).lerp(b[field],e);
   const interpolate=field=>a[field]+(b[field]-a[field])*e;
   if(scene.fog){
     scene.fog.color.copy(sampled.fog);
     scene.fog.near=interpolate('near');scene.fog.far=interpolate('far');
   }
   if(skyUniforms){
     skyUniforms.top.value.copy(sampled.skyTop);
     skyUniforms.mid.value.copy(sampled.skyMid);
     skyUniforms.low.value.copy(sampled.skyLow);
   }
   if(ambient){
     ambient.color.copy(sampled.hemiSky);
     ambient.groundColor.copy(sampled.hemiGround);
     ambient.intensity=interpolate('hemiI');
   }
   if(sun){sun.color.copy(sampled.sun);sun.intensity=interpolate('sunI');}
   glowLight.intensity=interpolate('glow');
 };
 return {
  group,
  setClimate(state){climate=state&&Number.isFinite(state.rain)&&Number.isFinite(state.phase)?state:null;},
  attachVfx(vfx){monsoonFx?.dispose();monsoonFx=vfx?createFenMonsoonFx(vfx):null;},
  stats:()=>({trees:FEN_TREES.length,pools:FEN_POOLS.length,spores:ecology.stats().spores,
    landmarks:sites.stats(),ecology:ecology.stats(),
    monsoon:monsoonBloom.stats(),mirrors:moonMirrors.stats()}),
  update(dt,t,eye,worldClock=null){
   const inside=active(eye);group.visible=inside;
   if(inside){
    if(!prior){prior={fog:scene.fog?{color:scene.fog.color.clone(),near:scene.fog.near,far:scene.fog.far}:null,
       sky:sky?.position.clone(),moonVisible:moon?.visible,
       skyColors:skyUniforms?{top:skyUniforms.top.value.clone(),mid:skyUniforms.mid.value.clone(),low:skyUniforms.low.value.clone()}:null,
       ambient:ambient?.intensity,ambientSky:ambient?.color.clone(),ambientGround:ambient?.groundColor.clone(),
       sun:sun?.intensity,sunColor:sun?.color.clone()};}
    setClockLighting(worldClock??(climate?.phase!=null?Math.round(climate.phase*10000):null));
    if(sky)sky.position.set(eye.x,0,eye.z);
    if(moon)moon.visible=moonAboveFen(climate?.phase??(Number.isFinite(worldClock)?worldClock/10000:null))&&(climate?.rain??0)<.55;
    clock+=Math.max(0,dt||0);
    sites.update(dt,typeof reducedMotion==='function' ? reducedMotion() : !!reducedMotion);
    ecology.update(clock,typeof reducedMotion==='function' ? reducedMotion() : !!reducedMotion);
    monsoonBloom.update(climate);
    moonMirrors.update(eye,climate?.phase??(Number.isFinite(worldClock)?worldClock/10000:null),climate);
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
    restore();
   }
  },
  dispose(){
   restore();monsoonFx?.dispose();moonMirrors.dispose();monsoonBloom.dispose();
   sites.dispose();ecology.dispose();
   floor.dispose();soil.dispose();
   group.removeFromParent();
  }
 };
}
