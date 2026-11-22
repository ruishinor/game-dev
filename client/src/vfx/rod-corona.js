// Runtime-only persistent weapon-local electrical corona. Everything here is
// owned by the weapon: layered emissive geometry and two billboard sprites per
// half, prebuilt once. No global particle pool, ribbon or light is consumed, so
// an always-on corona cannot starve class ability effects, and per-frame work
// is visibility/opacity/scale changes only (no allocation).
//
// Layers per half, inside to out:
//  - two counter-rotating helical filaments (core + soft halo)
//  - flickering crackle strands: prebuilt jagged variants, a few shown at a time
//  - an additive plasma sheath around the shaft
//  - an emitter glow sprite at the tip
// `activity` (attack animation) and `surge` (pulses from transform, draw,
// charge and contact) escalate every layer; `combat` raises the idle floor.
import * as THREE from 'three';
import {DEFAULT_ROD_PALETTE} from '../rod-palette.js';

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(x)?x:0));
const CRACKLE_VARIANTS=6;

// Deterministic jitter so geometry (and tests) are reproducible.
function lcg(seed){let s=seed>>>0;return ()=>((s=(s*1664525+1013904223)>>>0)/4294967296);}

let glowTexture=null,glowUsers=0;
function radialGlow(){
 // Soft round falloff as a DataTexture: no DOM canvas, so it also builds in Node.
 if(!glowTexture){
  const n=32,data=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const d=Math.hypot(x-(n-1)/2,y-(n-1)/2)/(n/2),a=Math.pow(clamp(1-d),2.2);
   const i=(y*n+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(a*255);
  }
  glowTexture=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);
  glowTexture.needsUpdate=true;glowTexture.magFilter=glowTexture.minFilter=THREE.LinearFilter;
 }
 glowUsers++;
 return glowTexture;
}
function releaseGlow(){if(--glowUsers<=0&&glowTexture){glowTexture.dispose();glowTexture=null;glowUsers=0;}}

function crackleGeometry(rand){
 // Collar to emitter along the shaft, displaced off the surface like a discharge.
 const points=[],segments=11;
 const base=rand()*Math.PI*2,twist=(rand()-.5)*2.2;
 for(let i=0;i<=segments;i++){
  const t=i/segments,angle=base+twist*t;
  const r=.036+(i===0||i===segments?0:.012+rand()*.034);
  points.push(new THREE.Vector3(Math.cos(angle)*r+(rand()-.5)*.012,.25+t*.47,Math.sin(angle)*r+(rand()-.5)*.012));
 }
 return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,false,'catmullrom',.1),28,.0042,4,false);
}

export function createRodCorona(halves,palette=DEFAULT_ROD_PALETTE){
 const P=palette;
 const variants=[0,1].map(lane=>{
  const points=[];
  for(let i=0;i<=20;i++){
   const t=i/20,angle=t*Math.PI*3.4+lane*Math.PI+(i%2?.31:-.19);
   const r=.045+Math.sin(Math.PI*t)*(.069+(i%3)*.013);
   points.push(new THREE.Vector3(Math.cos(angle)*r,.24+t*.51,Math.sin(angle)*r));
  }
  const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
  return [new THREE.TubeGeometry(curve,40,.0085,5,false),new THREE.TubeGeometry(curve,40,.022,5,false)];
 });
 const rand=lcg(0x5eed);
 const crackles=Array.from({length:CRACKLE_VARIANTS},()=>crackleGeometry(rand));
 // Plasma sheath: an open lathe hugging the shaft, wider at the emitter cage.
 const sheathProfile=[[.25,.034],[.31,.05],[.46,.056],[.62,.058],[.71,.066],[.755,.05],[.775,.02]].map(([y,r])=>new THREE.Vector2(r,y));
 const sheathGeometry=new THREE.LatheGeometry(sheathProfile,18);
 const outerGeometry=new THREE.LatheGeometry(sheathProfile.map(v=>new THREE.Vector2(v.x*1.75,v.y)),18);
 const glow=radialGlow();
 const groups=halves.map((half,i)=>{
  const group=new THREE.Group();group.name='RodCorona'+i;
  const core=new THREE.MeshBasicMaterial({color:P.core,toneMapped:false,transparent:true,opacity:.94,depthWrite:false});
  const halo=new THREE.MeshBasicMaterial({color:P.halo,toneMapped:false,transparent:true,opacity:.18,depthWrite:false,blending:THREE.AdditiveBlending});
  const strands=variants.map(([g,h],j)=>{
   const strand=new THREE.Group();strand.name='ElectricalFilament'+j;
   strand.add(new THREE.Mesh(g,core),new THREE.Mesh(h,halo));group.add(strand);return strand;
  });
  // Detail layers live in a separate child group so the filament contract
  // (children[0..1] are the helical strands) stays stable.
  const detail=new THREE.Group();detail.name='RodCoronaDetail'+i;
  const spark=new THREE.MeshBasicMaterial({color:P.spark,toneMapped:false,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  const crackle=new THREE.Group();crackle.name='RodCrackle'+i;
  const arcs=crackles.map((g,j)=>{const m=new THREE.Mesh(g,spark);m.name='RodCrackleArc'+j;m.visible=false;crackle.add(m);return m;});
  const sheathMat=new THREE.MeshBasicMaterial({color:P.sheath,toneMapped:false,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  const outerMat=new THREE.MeshBasicMaterial({color:P.outer,toneMapped:false,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  const sheath=new THREE.Mesh(sheathGeometry,sheathMat);sheath.name='RodPlasmaSheath'+i;
  const outer=new THREE.Mesh(outerGeometry,outerMat);outer.name='RodPlasmaHalo'+i;
  const tipMat=new THREE.SpriteMaterial({map:glow,color:P.tip,toneMapped:false,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  const tip=new THREE.Sprite(tipMat);tip.name='RodEmitterGlow'+i;tip.position.y=.735;
  for(const o of [sheath,outer,tip,...arcs])o.renderOrder=2;
  detail.add(crackle,sheath,outer,tip);
  group.add(detail);
  half.add(group);group.visible=false;
  return {group,core,halo,strands,detail,arcs,spark,sheath,outer,sheathMat,outerMat,tip,tipMat,crackleClock:0,shown:[]};
 });
 let elapsed=0,dead=false,surge=0,flicker=1,flickerClock=0;
 return {
  /** Escalate every layer briefly (0..1); decays over roughly half a second. */
  pulse(strength=1){if(!dead)surge=Math.max(surge,clamp(strength));},
  get surge(){return surge;},
  update(dt,{energized=true,activity=0,quality=2,intensity=1,calm=false,reducedMotion=false,combat=false,joined=true}={}){
   if(dead)return;
   const quiet=calm||reducedMotion,level=clamp(intensity),step=clamp(dt,0,.1);
   if(!quiet)elapsed+=step;
   surge=Math.max(0,surge-step*1.9);
   // Low-frequency flicker shared by the sheath and glow (none when quiet).
   flickerClock-=step;
   if(flickerClock<=0){flickerClock=.045+Math.random()*.06;flicker=quiet?1:.78+Math.random()*.32;}
   const low=quality<=0||quiet||level<=.3;
   const power=clamp(Math.max(clamp(activity),surge));
   // Idle floor: visible at rest; combat readiness raises it; joined burns hotter.
   const floor=(combat?.62:.42)*(joined?1:.86);
   const drive=clamp(floor+power*(1-floor));
   for(const [i,g] of groups.entries()){
    const {group,core,halo,strands,detail,arcs,spark,sheath,outer,sheathMat,outerMat,tip,tipMat}=g;
    group.visible=!!energized;
    core.opacity=(low?.73:.96)*(.55+.45*level);
    halo.opacity=low?.12:(.22+.3*power)*level;
    for(const [j,strand] of strands.entries()){
     strand.visible=!!energized&&(j===0||!low);
     const envelope=quiet?1:1+power*.65*level;
     strand.scale.set(envelope,1,envelope);
     strand.rotation.y=quiet?i*.7+j*.65:(j===0?1:-1)*elapsed*(.9+j*.35+power*1.4)+i*.7;
    }
    detail.visible=!!energized;
    // Sheath and emitter glow: present in every tier, static when quiet.
    const k=low?.58:flicker;
    sheathMat.opacity=clamp((quiet?.1:.11+.37*drive)*k*level);
    outerMat.opacity=clamp((low?0:.025+.16*drive*drive)*k*level);
    sheath.visible=sheathMat.opacity>.004;outer.visible=!low&&outerMat.opacity>.004;
    const sheathScale=1+(quiet?0:power*.45);
    sheath.scale.set(sheathScale,1,sheathScale);outer.scale.set(sheathScale*1.08,1,sheathScale*1.08);
    if(!quiet)outer.rotation.y=-elapsed*1.3;
    tipMat.opacity=clamp((low?.52:.48+.48*drive)*(low?1:flicker)*level);
    const tipSize=(low?.19:.19+.33*drive+.22*surge)*(joined?1:.9);
    tip.scale.set(tipSize,tipSize,1);
    // Crackle: a few prebuilt jagged strands re-chosen at 10-26 Hz.
    if(low){for(const a of arcs)a.visible=false;spark.opacity=0;continue;}
    g.crackleClock-=step;
    if(g.crackleClock<=0){
     g.crackleClock=1/(10+16*drive)*(.7+Math.random()*.6);
     const count=Math.min(arcs.length,1+Math.round(drive*2.4+surge*1.6));
     for(const a of arcs)a.visible=false;
     // Select without replacement: repeated random indices previously hid the
     // requested surge even when the corona requested several visible arcs.
     // Both strides are coprime with the six arcs, so exactly 'count' light up.
     const start=Math.floor(Math.random()*arcs.length);
     const stride=Math.random()<.5?1:arcs.length-1;
     for(let n=0;n<count;n++)arcs[(start+n*stride)%arcs.length].visible=true;
     detail.children[0].rotation.y=Math.random()*Math.PI*2;
    }
    spark.opacity=clamp((.45+.5*drive)*flicker*level);
   }
  },
  dispose(){if(dead)return;dead=true;
   for(const {group,core,halo,spark,sheathMat,outerMat,tipMat} of groups){group.removeFromParent();for(const m of [core,halo,spark,sheathMat,outerMat,tipMat])m.dispose();}
   for(const pair of variants)for(const geo of pair)geo.dispose();
   for(const geo of crackles)geo.dispose();
   sheathGeometry.dispose();outerGeometry.dispose();releaseGlow();}
 };
}
