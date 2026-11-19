// Runtime-only persistent weapon-local electrical filaments. Layered emissive
// geometry reads without bloom, camera-facing ribbons or the global particle pool.
import * as THREE from 'three';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(x)?x:0));
export function createRodCorona(halves){
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
 const groups=halves.map((half,i)=>{
  const group=new THREE.Group();group.name='RodCorona'+i;
  const core=new THREE.MeshBasicMaterial({color:0xc3f6ff,toneMapped:false,transparent:true,opacity:.94,depthWrite:false});
  const halo=new THREE.MeshBasicMaterial({color:0x249cff,toneMapped:false,transparent:true,opacity:.18,depthWrite:false,blending:THREE.AdditiveBlending});
  const strands=variants.map(([g,h],j)=>{
   const strand=new THREE.Group();strand.name='ElectricalFilament'+j;
   strand.add(new THREE.Mesh(g,core),new THREE.Mesh(h,halo));group.add(strand);return strand;
  });
  half.add(group);group.visible=false;
  return {group,core,halo,strands};
 });
 let elapsed=0,dead=false;
 return {
  update(dt,{energized=true,activity=0,quality=2,intensity=1,calm=false,reducedMotion=false}={}){
   if(dead)return;
   const quiet=calm||reducedMotion,level=clamp(intensity),power=clamp(activity);
   if(!quiet)elapsed+=clamp(dt,0,.1);
   for(const [i,{group,core,halo,strands}] of groups.entries()){
    group.visible=!!energized;
    const low=quality<=0||quiet||level<=.3;
    core.opacity=(low?.48:.96)*(.55+.45*level);
    halo.opacity=low?.06:(.18+.20*power)*level;
    for(const [j,strand] of strands.entries()){
     strand.visible=!!energized&&(j===0||!low);
     const envelope=quiet?1:1+power*.65*level;
     strand.scale.set(envelope,1,envelope);
     strand.rotation.y=quiet?i*.7+j*.65:(j===0?1:-1)*elapsed*(.9+j*.35)+i*.7;
    }
   }
  },
  dispose(){if(dead)return;dead=true;for(const {group,core,halo} of groups){group.removeFromParent();core.dispose();halo.dispose();}for(const pair of variants)for(const geo of pair)geo.dispose();}
 };
}
