// Native, already-loaded GLB geometry for Lumenfen's ground-level ecology.
// Runtime model pieces remain optional: structural gameplay and safe approaches
// are entirely independent of the visual asset source.
import {LUMENFEN,FEN_SITES,fenHeight} from '../../shared/lumenfen.js';
import {planLumenfenGroundcover} from './lumenfen-groundcover.js';

const ECOLOGICAL_PIECES=Object.freeze({
  'veil-landing':['Fern_1','Plant_7_Big'],
  'mossbound-thicket':['Fern_1','Mushroom_Common','Plant_1_Big'],
  'glasswater-spring':['Pebble_Round_1','Grass_Wispy_Tall'],
  'root-crown-hollow':['Mushroom_Common','Fern_1'],
  'tidal-weir':['Grass_Wispy_Tall','Plant_7_Big'],
  'luminous-canopy':['Fern_1','Grass_Wispy_Tall','Mushroom_Laetiporus'],
});
const PORTAL_APPROACHES=Object.freeze([
  LUMENFEN.arrival,LUMENFEN.returnRift,LUMENFEN.springRift,
  LUMENFEN.crownRift,LUMENFEN.springLanding,LUMENFEN.crownLanding,
]);
export const LUMENFEN_GLB_PIECES=Object.freeze([...new Set(Object.values(ECOLOGICAL_PIECES).flat())]);

export function buildLumenfenGlbAccents(T,assets){
  const group=new T.Group();group.name='lumenfen:glb-wetland-accents';
  const instances=[],missing=[],placementsByPiece=new Map(),stats={eligible:0,placed:0,batches:0,missing};
  const report=()=>({...stats,missing:missing.slice()});
  const dispose=()=>{
    group.removeFromParent();
    for(const mesh of instances)mesh.dispose?.();
    // Never dispose the shared nature GLB's geometry or materials.
    instances.length=0;
  };
  if(!assets?.get?.('nature')||typeof assets.instance!=='function')
    return {group,stats:report,dispose};

  // Layout is a pure function of site anchors and never moves player colliders.
  // Each grouped GLB component sits beyond each landmark's architectural core.
  for(const site of FEN_SITES){
    const choices=ECOLOGICAL_PIECES[site.id];
    if(!choices)continue;
    for(let i=0;i<9;i++){
      const angle=i*2.399963+(site.x-site.z)*.0031;
      const radius=site.clearance+2.6+(i%4)*1.1;
      const x=site.x+Math.cos(angle)*radius,z=site.z+Math.sin(angle)*radius;
      if(!PORTAL_APPROACHES.every(p=>Math.hypot(x-p.x,z-p.z)>11))continue;
      const piece=choices[i%choices.length];
      const plan=placementsByPiece.get(piece)||[];
      const scale=piece==='Pebble_Round_1'?.85:.72+(i%4)*.12;
      plan.push({x,y:fenHeight(x,z),z,ry:angle*.45,scale});
      placementsByPiece.set(piece,plan);stats.eligible++;
    }
  }
  // Beyond landmark islands, distribute actual nature-GLB donors throughout
  // the connected watershed. The authored six-metre fallback always remains
  // visible if assets are disabled or missing.
  const visualDonors={
    fern:'Fern_1',sedge:'Grass_Wispy_Tall',reed:'Grass_Wispy_Tall',
    fungi:'Mushroom_Common',driftwood:'Plant_1_Big'
  };
  for(const cell of planLumenfenGroundcover().cells){
    if(cell.portal||cell.water||(cell.col+cell.row*2)%5!==0)continue;
    if(FEN_SITES.some(s=>Math.hypot(cell.x-s.x,cell.z-s.z)<s.clearance+4))continue;
    const piece=visualDonors[cell.kind];
    if(!piece)continue;
    const plan=placementsByPiece.get(piece)||[];
    plan.push({x:cell.x,y:fenHeight(cell.x,cell.z),z:cell.z,
      ry:cell.rotation,scale:cell.scale*(piece==='Plant_1_Big'?.6:.75)});
    placementsByPiece.set(piece,plan);stats.eligible++;
  }
  const placeMatrix=new T.Matrix4(),resultMatrix=new T.Matrix4();
  const translation=new T.Vector3(),rotation=new T.Quaternion(),size=new T.Vector3();
  const sourceRotation=new T.Euler(0,0,0);
  for(const [piece,points]of placementsByPiece){
    const donor=assets.instance('nature',piece);
    if(!donor){missing.push(piece);continue;}
    donor.updateMatrixWorld(true);
    donor.traverse(child=>{
      if(!child.isMesh||child.isSkinnedMesh||!child.geometry||!child.material)return;
      const mesh=new T.InstancedMesh(child.geometry,child.material,points.length);
      mesh.name='lumenfen:glb:'+piece;
      mesh.castShadow=false;mesh.receiveShadow=true;
      for(let i=0;i<points.length;i++){
        const p=points[i];translation.set(p.x,p.y,p.z);
        sourceRotation.set(0,p.ry,0);
        rotation.setFromEuler(sourceRotation);
        size.setScalar(p.scale);
        placeMatrix.compose(translation,rotation,size);
        resultMatrix.multiplyMatrices(placeMatrix,child.matrixWorld);
        mesh.setMatrixAt(i,resultMatrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();group.add(mesh);instances.push(mesh);
      stats.batches++;stats.placed+=points.length;
    });
  }
  return {group,stats:report,dispose};
}
