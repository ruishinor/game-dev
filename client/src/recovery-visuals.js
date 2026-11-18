// A non-interactive visual marker of recoverable remains, not an item drop.
// Only the local, authoritative lootable list may create one. Contents,
// quality, rarity, counts, interaction and reward state are never inferred.
import { mergeGeometries } from './gear-kit.js';
export const RECOVERY_LIMIT=12;
export function createRecoveryVisuals(T,scene,groundHeight){
  const root=new T.Group();root.name='corpse-recovery-visuals';scene.add(root);
  const frame=new T.MeshStandardMaterial({color:0x45514e,roughness:.71,metalness:.33});
  const insert=new T.MeshStandardMaterial({color:0x8b806a,roughness:.85,metalness:.12});
  const clasp=new T.MeshStandardMaterial({color:0xbba579,roughness:.53,metalness:.28});
  const template=new T.Group();
  const batches=new Map();
  function box(m,w,h,d,x,y,z,ry=0){
    const g=new T.BoxGeometry(w,h,d).rotateY(ry).translate(x,y,z);
    if(!batches.has(m))batches.set(m,[]);
    batches.get(m).push(g);
  }
  // Abstract recovery tag: two compact pieces and a folded strap. This does
  // not purport to be the specific equipment inside the corpse.
  box(frame,.40,.070,.26,0,.055,0);
  box(insert,.32,.095,.20,-.015,.135,0);
  box(frame,.055,.12,.218,-.13,.14,0);
  box(frame,.055,.12,.218,.10,.14,0);
  box(clasp,.09,.035,.10,.10,.215,.015);
  box(clasp,.15,.09,.14,.08,.075,.15,.15);
  for(const [m,parts] of batches){
    const geo=mergeGeometries(T,parts);parts.forEach(g=>g.dispose());
    const mesh=new T.Mesh(geo,m);mesh.castShadow=false;mesh.receiveShadow=true;
    template.add(mesh);
  }
  const active=new Map();
  let disposed=false;
  function remove(id){const entry=active.get(id);if(entry){root.remove(entry.group);active.delete(id);}}
  function clear(){for(const id of active.keys())remove(id);}
  function sync(entities,available,viewer,engine=null,quality=1,reduced=false){
    if(disposed)return;
    const eligible=new Map();
    for(const row of available||[]){
      const ent=entities.get(row.id),p=ent?.pos;
      if(ent?.meta?.k!=='e'||!ent.dead||!ent.placed||!p||![p.x,p.z].every(Number.isFinite))continue;
      eligible.set(row.id,{row,ent});
    }
    const choices=[...eligible.values()].sort((a,b)=>{
      if(!viewer)return a.row.id-b.row.id;
      return Math.hypot(a.ent.pos.x-viewer.x,a.ent.pos.z-viewer.z)-Math.hypot(b.ent.pos.x-viewer.x,b.ent.pos.z-viewer.z);
    }).slice(0,RECOVERY_LIMIT);
    const selected=new Set(choices.map(x=>x.row.id));
    for(const id of active.keys())if(!selected.has(id))remove(id);
    for(const {row,ent} of choices){
      let entry=active.get(row.id);
      if(entry&&entry.generation!==row.generation){remove(row.id);entry=null;}
      if(!entry){
        const group=template.clone(true);group.name='recovery-cache:'+row.id;
        root.add(group);entry={group,generation:row.generation,announced:false};active.set(row.id,entry);
      }
      const g=entry.group, yaw=Number.isFinite(ent.displayYaw)?ent.displayYaw:0;
      const offset=Math.min(.48,Math.max(.25,(ent.model?.radius||.5)*.42));
      const x=ent.pos.x+Math.cos(yaw)*offset,z=ent.pos.z-Math.sin(yaw)*offset,y=groundHeight(x,z);
      g.visible=Number.isFinite(y)&&ent.inView!==false;
      if(!g.visible)continue;
      g.position.set(x,y,z);g.rotation.y=yaw;
      if(!entry.announced){
        entry.announced=true;
        // A modest presentation cue only; never call the acquisition recipe
        // before the server reports an actual acquisition.
        if(engine&&quality>0&&!reduced)engine.burst({at:[x,y+.16,z],count:5,color:0xd2bc88,life:[.35,.55],size:[.035,.065],speed:[.25,.6],spread:.6});
      }
    }
  }
  return {sync,remove,clear,dispose(){
    if(disposed)return;disposed=true;clear();scene.remove(root);
    template.traverse(n=>{if(n.isMesh){n.geometry.dispose();n.material.dispose();}});
  }};
}
