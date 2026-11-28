import { createAnnexChamberDetail } from './annex-chamber-detail.js';

// Three visually enclosed Phase Annex chambers. All meshes are presentation-only:
// no new collider, portal, floor height or server-owned navigation changes.
export const ANNEX_ROOMS = Object.freeze([
  Object.freeze({ name:'Arrival Gallery', near:12, far:34, center:23, tint:0x8cc8d0, dark:0x1b343c }),
  Object.freeze({ name:'Relay Workshop', near:-9, far:12, center:1.5, tint:0xd7ad78, dark:0x382b25 }),
  Object.freeze({ name:'Null Chamber', near:-34, far:-9, center:-21.5, tint:0xb19bdf, dark:0x2c253d }),
]);
export const ANNEX_SHELL_HEIGHT = 8.6;
export function createAnnexInterior(T, annex, {assets=null}={}) {
  const group = new T.Group();
  group.name='annex:enclosed-chambers';
  group.position.set(annex.x,0,annex.z);
  const owned=[],materials=[],roofs=[],lights=[];
  const mat = (color,{metalness=.45,roughness=.68,emissive=0,emissiveIntensity=0}={}) => {
    const m=new T.MeshStandardMaterial({color,metalness,roughness,emissive,emissiveIntensity});
    materials.push(m);return m;
  };
  const wall=mat(0x242e38),rib=mat(0x66717b,{metalness:.72}),floor=mat(0x39434a),
    gasket=mat(0x111b21,{roughness:.92}),ceramic=mat(0xb0a18c,{metalness:.25,roughness:.7});
  const add=(parent,geom,m,x,y,z,name,shadow=false)=>{
    const o=new T.Mesh(geom,m);
    o.name=name;o.position.set(x,y,z);o.castShadow=shadow;o.receiveShadow=true;
    parent.add(o);owned.push(geom);return o;
  };
  const box=(p,m,w,h,d,x,y,z,name,shadow=false)=>add(p,new T.BoxGeometry(w,h,d),m,x,y,z,name,shadow);
  // The original floor and authoritative 4.5m bulkheads are retained.
  // Extend the perimeter above the original walls, rather than leaving the
  // global red sky and exterior landscape visible from each dungeon room.
  for(const side of [-1,1]) {
    box(group,wall,.56,ANNEX_SHELL_HEIGHT-4.5,annex.hd*2+.8,
      side*(annex.hw+.25),(ANNEX_SHELL_HEIGHT+4.5)/2,0,'annex:upper-perimeter');
    for(let z=-annex.hd+2;z<annex.hd;z+=6.8) {
      box(group,rib,.36,ANNEX_SHELL_HEIGHT-3.6,.52,
        side*(annex.hw-.12),(ANNEX_SHELL_HEIGHT+3.6)/2,z,'annex:wall-rib');
    }
  }
  for(const z of [-annex.hd-.25,annex.hd+.25]){
    box(group,wall,annex.hw*2+.55,ANNEX_SHELL_HEIGHT-4.5,.55,
      0,(ANNEX_SHELL_HEIGHT+4.5)/2,z,'annex:upper-endwall');
  }
  // The shared authoritative partitions end at 4.5m. Fill the *upper*
  // half of each inter-room wall to the roof; otherwise all three chambers
  // remain visually open to each other above the apparently short bulkheads.
  // The two offset passages remain open for their full 4.5m clearance.
  for(const [z,gap] of [[12,6],[-9,-6]]){
    box(group,wall,annex.hw*2+.55,ANNEX_SHELL_HEIGHT-4.5,.72,
      0,(ANNEX_SHELL_HEIGHT+4.5)/2,z,'annex:upper-partition');
    box(group,rib,6.8,.45,.9,gap,4.62,z,'annex:door-header');
    for(const dx of [-3.05,3.05])
      box(group,ceramic,.18,.65,.92,gap+dx,4.94,z,'annex:door-upper-jamb');
  }
  const roomCenters=[];
  for(let index=0;index<ANNEX_ROOMS.length;index++){
    const room=ANNEX_ROOMS[index],depth=room.far-room.near,place=new T.Group();
    place.name='annex:room:'+room.name.toLowerCase().replaceAll(' ','-');
    group.add(place);roomCenters.push(place);
    const trim=mat(room.tint,{metalness:.62,roughness:.46,emissive:room.dark,emissiveIntensity:.32});
    const dark=mat(room.dark,{metalness:.42,roughness:.84});
    const lens=mat(room.tint,{metalness:.2,roughness:.25,emissive:room.tint,emissiveIntensity:.7});
    // Fully covered, differentiated ceiling bays. Under-ceiling lighting and
    // transverse beams provide an enclosed silhouette without floor props.
    const roofMat=mat(index===2?0x151b2c:index===1?0x242830:0x1b3037);
    roofMat.transparent=true;
    const roof=box(place,roofMat,annex.hw*2+.9,.32,depth+.09,
      0,ANNEX_SHELL_HEIGHT+.16,room.center,'annex:roof:'+index);
    roof.userData.room=index;
    roofs.push(roof);
    for(let z=room.near+2;z<room.far;z+=4.5){
      box(place,rib,annex.hw*2+.35,.28,.35,0,ANNEX_SHELL_HEIGHT-.28,z,'annex:ceiling-truss');
      for(const x of [-11.6,11.6]){
        box(place,gasket,3.0,.06,.19,x,ANNEX_SHELL_HEIGHT-.52,z,'annex:light-recess');
        box(place,trim,2.4,.024,.08,x,ANNEX_SHELL_HEIGHT-.57,z,'annex:diffuse-light');
      }
    }
    for(const side of [-1,1]){
      // Three unique wall systems: arrival cradle, workshop ducts and null
      // containment ribs. All details sit on or above the existing walls.
      for(let z=room.near+2.7;z<room.far-1;z+=5.5){
        const x=side*(annex.hw-.72);
        if(index===0){
          const arch=add(place,new T.TorusGeometry(1.45,.12,8,30,Math.PI),ceramic,
            x,3.10,z,'annex:arrival-arched-bay');
          arch.rotation.y=side*Math.PI/2;
          box(place,lens,.10,1.35,.25,x-side*.16,2.3,z,'annex:arrival-beacon');
        }else if(index===1){
          for(let k=0;k<3;k++){
            const pipe=add(place,new T.CylinderGeometry(.13,.13,4.5,10),k===1?trim:rib,
              x,3.35,z+(k-1)*.34,'annex:relay-pressure-line');
            pipe.rotation.x=Math.PI/2;
          }
          box(place,dark,.22,2.5,2.2,x,2.65,z,'annex:relay-service-bay');
          box(place,lens,.12,.85,.72,x-side*.14,2.8,z,'annex:relay-readout');
        }else{
          // A visibly sealed, instrumented containment rack. Earlier glowing
          // concentric wall rings resembled usable rifts despite having no
          // travel trigger, creating a false portal cue in the boss chamber.
          box(place,dark,.16,3.25,1.8,x,2.9,z,'annex:null-service-column');
          for(const dy of [2.25,3.1,3.9])
            box(place,dy===3.1?lens:trim,.11,.085,1.55,
              x-side*.22,dy,z,'annex:null-containment-busbar');
          for(const dz of [-.72,.72])
            box(place,ceramic,.16,2.4,.12,
              x-side*.24,3.12,z+dz,'annex:null-containment-mount');
        }
      }
    }
    // One local soft source per room. Its coloration acts as wayfinding, not
    // an uncontrolled flood light or an enemy-telegraph replacement.
    const light=new T.PointLight(room.tint,index===2?23:18,19,2);
    light.name='annex:chamber-light:'+index;
    light.position.set(0,5.8,room.center);light.castShadow=false;
    place.add(light);lights.push(light);
    for(const x of [-10.5,10.5]){
      box(place,floor,2.6,.025,depth-3,x,.032,room.center,'annex:floor-inlay');
      for(let z=room.near+2;z<room.far-1;z+=3)
        box(place,trim,1.35,.018,.06,x,.05,z,'annex:floor-inlay-trace');
    }
  }
  // Reuse available production GLBs as wall-mounted utilities, without
  // rendering anonymous source-ZIP donors or altering authoritative colliders.
  let glbParts=0;
  if(assets?.get?.('sanctum') && assets?.instance){
    for(const [index,room] of ANNEX_ROOMS.entries()) {
      for(const side of [-1,1]){
        const name=index===1?'Prop_AccessPoint':index===2?'Prop_Computer':'Prop_ItemHolder';
        try{
          const obj=assets.instance('sanctum',name);
          if(!obj)continue;
          obj.name='annex:production-glb:'+name;
          obj.position.set(side*(annex.hw-1.05),1.5,room.center);
          obj.scale.set(.52,.62,.54);
          obj.rotation.y=side>0?-Math.PI/2:Math.PI/2;
          group.add(obj);glbParts++;
        }catch(err){console.warn('[annex] optional production GLB unavailable',name,err);}
      }
    }
  }
  const chamberDetail = createAnnexChamberDetail(T, annex, ANNEX_ROOMS);
  group.add(chamberDetail.group);
  const stats={rooms:3,roofs:roofs.length,lights:lights.length,glbParts,
    detail:chamberDetail.stats,colliderChanges:0};
  return {group,stats,update(eye,t=0,reducedMotion=false){
    chamberDetail.update(t,reducedMotion);
    const inside=!!eye&&Math.abs(eye.x-annex.x)<annex.hw+32
      &&Math.abs(eye.z-annex.z)<annex.hd+25;
    group.visible=inside;
    if(!inside)return;
    // Third-person cameras can rise through the roof. Make only the overhead
    // slab translucent while the camera is above it; keep the wall shell and
    // all orientation lights visible. No geometry or colliders move.
    const cameraAbove=eye.y>ANNEX_SHELL_HEIGHT-.25&&eye.y<ANNEX_SHELL_HEIGHT+12;
    for(const roof of roofs){
      const sameRoom=Math.abs(eye.z-annex.z-ANNEX_ROOMS[roof.userData.room].center)<16;
      roof.material.opacity=cameraAbove&&sameRoom?.10:1;
      roof.material.depthWrite=roof.material.opacity===1;
    }
  },dispose(){
    chamberDetail.dispose();
    group.removeFromParent();
    for(const x of new Set(owned))x.dispose();
    for(const m of new Set(materials))m.dispose();
    for(const l of lights)l.dispose?.();
  }};
}
