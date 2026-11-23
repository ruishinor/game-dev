// Render the *generated* GLB remeshes, not raw donor meshes. The server
// reconstructs and validates these from named archive nodes at startup.
// Fitted, instanced assets are distant, non-colliding biome landmarks; all
// generated Geometry/Material ownership is held until dispose.
import {FEN_SITES,FEN_POOLS,fenHeight,LUMENFEN} from '../../shared/lumenfen.js';
import {FEN_DONOR_IDS} from '../../shared/lumenfen-fidelity.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const PROFILE=Object.freeze({
 rootglass_oak:{sites:['mossbound-thicket','luminous-canopy'],count:4,height:11,angle:.37},
 cage_bloom:{sites:['mossbound-thicket','luminous-canopy'],count:6,height:5.2,angle:.81},
 stone_guild:{sites:['root-crown-hollow'],count:1,height:6.6,angle:2.7},
 tidal_boardwalk:{sites:['glasswater-spring','veil-landing'],count:2,height:1.7,angle:1.7},
 weir_mechanism:{sites:['tidal-weir'],count:1,height:3.8,angle:4.1},
 wetland_bird:{sites:['glasswater-spring','luminous-canopy'],count:3,height:1.8,angle:2.2},
 rift_radial_mesh:{sites:['veil-landing','root-crown-hollow'],count:2,height:2.5,angle:3.7},
});
const approaches=[LUMENFEN.arrival,LUMENFEN.returnRift,
 LUMENFEN.springRift,LUMENFEN.crownRift,
 LUMENFEN.springLanding,LUMENFEN.crownLanding];

function plan(){
 const locations=new Map();
 for(const [id,profile]of Object.entries(PROFILE)){
  const positions=[];
  for(const name of profile.sites){
   const site=FEN_SITES.find(s=>s.id===name);
   if(!site)continue;
   for(let i=0;i<profile.count;i++){
    const theta=profile.angle+i*2.399963+(site.x-site.z)*.0051;
    const radius=site.clearance+9+(i%3)*2.5;
    const x=site.x+Math.cos(theta)*radius,z=site.z+Math.sin(theta)*radius;
    if(!approaches.every(p=>Math.hypot(p.x-x,p.z-z)>12))continue;
    if(FEN_POOLS.some(w=>Math.hypot(w.x-x,w.z-z)<Math.min(w.rx,w.rz)*.76))continue;
    positions.push({x,z,angle:theta,height:profile.height,site:name});
   }
  }
  locations.set(id,positions);
 }
 return locations;
}
export const FEN_PRODUCTION_PLACEMENTS=plan();

export function buildLumenfenFidelityFixtures(T,loader,{quality=1}={}){
 const group=new T.Group();group.name='lumenfen:production-remeshed-glbs';
 const batches=[],owned=new Set(),mergedOwned=new Set(),ready=new Set(),missing=new Map();
 const sourceResources=[];
 let disposed=false,wetness=0;
 const stats=()=>({ready:[...ready],missing:Object.fromEntries(missing),
   batches:batches.length,instances:batches.reduce((n,b)=>n+b.count,0),
   planned:[...FEN_PRODUCTION_PLACEMENTS.values()].reduce((n,x)=>n+x.length,0)});
 const fit=new T.Matrix4(),placement=new T.Matrix4(),matrix=new T.Matrix4(),dummy=new T.Vector3(),rotation=new T.Quaternion(),size=new T.Vector3(),euler=new T.Euler();
 const load=async(id)=>{
  const pts=FEN_PRODUCTION_PLACEMENTS.get(id)||[];
  if(!loader||!pts.length||disposed)return;
  try{
   const gltf=await loader.loadAsync('/client/assets/lumenfen-'+id+'.glb');
   const source=gltf.scene;
   if(disposed){source.traverse(o=>{if(o.isMesh){o.geometry?.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m?.dispose());}});return;}
   source.updateMatrixWorld(true);
   const bounds=new T.Box3().setFromObject(source);
   const span=bounds.getSize(new T.Vector3());
   const center=bounds.getCenter(new T.Vector3());
   if(![span.x,span.y,span.z].every(n=>Number.isFinite(n)&&n>0))throw Error('Unfit source mesh bounds');
   // Do not spread donors' original kit coordinates or override gameplay
   // colliders. Tall trees use real height; buildings are scaled by maximum.
   const target=PROFILE[id].height,ratio=target/span.y;
   if(!Number.isFinite(ratio)||ratio<=0||ratio>200)throw Error('Unsafe GLB fit transform');
   fit.makeTranslation(-center.x,-bounds.min.y,-center.z);
   sourceResources.push(source);
   const children=[];
   source.traverse(child=>{
     if(child.isMesh&&!child.isSkinnedMesh&&child.geometry)children.push(child);
   });
   if(!children.length)throw Error('Source GLB lacks renderable rigid triangle meshes');
   // All reconstructed primitives use the same archived-donor PBR map. Bake
   // their original hierarchy transforms once, then merge into one indexed
   // instanced geometry so an entire wetland site donor costs ONE draw call.
   const transformed=children.map(child=>{
     const geometry=child.geometry.clone();geometry.applyMatrix4(child.matrixWorld);
     return geometry;
   });
   let merged=null;
   if(children.every(o=>!Array.isArray(o.material)&&o.material===children[0].material))
     merged=mergeGeometries(transformed,false);
   if(merged){
     for(const geo of transformed)geo.dispose();
     mergedOwned.add(merged);
     const sourceMaterial=children[0].material;
     const upgraded=new T.MeshPhysicalMaterial({
       color:sourceMaterial.color?.clone()||0xffffff,
       map:sourceMaterial.map,normalMap:sourceMaterial.normalMap,
       normalScale:sourceMaterial.normalScale?.clone(),
       roughness:sourceMaterial.roughness??.65,
       roughnessMap:sourceMaterial.roughnessMap,
       metalness:sourceMaterial.metalness??.03,
       metalnessMap:sourceMaterial.metalnessMap,
       emissive:sourceMaterial.emissive?.clone()||0x000000,
       emissiveMap:sourceMaterial.emissiveMap,
       emissiveIntensity:sourceMaterial.emissiveIntensity??1,
       side:sourceMaterial.side,clearcoat:.18,clearcoatRoughness:.23,
     });
     owned.add(upgraded);
     const mesh=new T.InstancedMesh(merged,upgraded,pts.length);
     mesh.name='lumenfen:production:'+id+':merged-remeshed';
     mesh.castShadow=false;mesh.receiveShadow=true;
     for(let i=0;i<pts.length;i++){
       const p=pts[i];
       dummy.set(p.x,fenHeight(p.x,p.z),p.z);
       euler.set(0,p.angle,0);rotation.setFromEuler(euler);
       size.setScalar(ratio);placement.compose(dummy,rotation,size);
       matrix.multiplyMatrices(placement,fit);
       mesh.setMatrixAt(i,matrix);
     }
     mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
     group.add(mesh);batches.push(mesh);
   }else{
     for(const geo of transformed)geo.dispose();
     // Incompatible donor primitives retain their original material grouping,
     // never lose visibly important geometry merely to meet a draw-call cap.
     for(const child of children){
       const sourceMaterial=child.material;
       const mats=Array.isArray(sourceMaterial)?sourceMaterial:[sourceMaterial];
       const upgraded=mats.map(m=>{
         const out=new T.MeshPhysicalMaterial({
           color:m?.color?.clone()||0xffffff,map:m?.map,
           normalMap:m?.normalMap,normalScale:m?.normalScale?.clone(),
           roughness:m?.roughness??.65,roughnessMap:m?.roughnessMap,
           metalness:m?.metalness??.03,metalnessMap:m?.metalnessMap,
           emissive:m?.emissive?.clone()||0x000000,
           emissiveMap:m?.emissiveMap,clearcoat:.18,clearcoatRoughness:.23,
         });owned.add(out);return out;
       });
       const mesh=new T.InstancedMesh(child.geometry,
         Array.isArray(sourceMaterial)?upgraded:upgraded[0],pts.length);
       mesh.name='lumenfen:production:'+id+':'+(child.name||'mesh');
       mesh.castShadow=false;mesh.receiveShadow=true;
       for(let i=0;i<pts.length;i++){
         const p=pts[i];dummy.set(p.x,fenHeight(p.x,p.z),p.z);
         euler.set(0,p.angle,0);rotation.setFromEuler(euler);
         size.setScalar(ratio);placement.compose(dummy,rotation,size);
         matrix.multiplyMatrices(placement,fit).multiply(child.matrixWorld);
         mesh.setMatrixAt(i,matrix);
       }
       mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
       group.add(mesh);batches.push(mesh);
     }
   }
   ready.add(id);missing.delete(id);
  }catch(error){missing.set(id,String(error?.message||error));}
 };
 const promises=quality>0&&loader?Object.keys(PROFILE).map(id=>load(id)):[];
 return {
  group,ready:Promise.allSettled(promises),
  update(climate){
   wetness=Math.max(0,Math.min(1,Number(climate?.rain)||0));
   for(const material of owned){
     material.roughness=Math.max(.16,(material.userData.fenBaseRoughness??=material.roughness)-wetness*.19);
     material.clearcoat=.18+wetness*.34;
   }
  },
  stats,
  dispose(){
   disposed=true;group.removeFromParent();
   for(const b of batches)b.dispose?.();
   batches.length=0;
   for(const g of mergedOwned)g.dispose();mergedOwned.clear();
   // GLB meshes and their maps are owned here; no global asset bundle used.
   for(const source of sourceResources)source.traverse(o=>{
     if(!o.isMesh)return;
     o.geometry?.dispose();
     for(const m of Array.isArray(o.material)?o.material:[o.material]){
       for(const k of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap'])m?.[k]?.dispose();
       m?.dispose();
     }
   });
   sourceResources.length=0;
   for(const m of owned)m.dispose();
   owned.clear();
  }
 };
}
