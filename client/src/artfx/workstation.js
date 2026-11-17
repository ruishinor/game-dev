// Optional additive kitbash using existing cached Quaternius sanctum pieces.
// Caller supplies a detached tabletop clone. Return null if required desk absent.
// No asset ownership transfers and no gameplay state is changed.
export function assembleWorkstation(THREE,assets,tabletop,{crate=true}={}){
 if(!tabletop?.isObject3D||tabletop.parent)throw Error('detached tabletop required');
 const desk=assets.instance('sanctum','Prop_Desk_Medium');if(!desk)return null;
 const group=new THREE.Group();const bounds=obj=>{obj.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(obj);if(box.isEmpty())throw Error('empty workstation geometry');return box;};
 const d=bounds(desk),dc=d.getCenter(new THREE.Vector3());
 desk.position.x-=dc.x;desk.position.y-=d.min.y;desk.position.z-=dc.z;group.add(desk);
 const top=bounds(desk).max.y,t=bounds(tabletop),tc=t.getCenter(new THREE.Vector3());
 tabletop.position.x-=tc.x;tabletop.position.y+=top-t.min.y;tabletop.position.z-=tc.z;group.add(tabletop);
 if(crate){const c=assets.instance('sanctum','Prop_Crate3');if(c){c.scale.setScalar(.55);const b=bounds(c),cc=b.getCenter(new THREE.Vector3()),half=(b.max.x-b.min.x)/2;c.position.x+=bounds(desk).max.x+half+.16-cc.x;c.position.y-=b.min.y;c.position.z-=cc.z;group.add(c);}}
 function detach(){group.remove(tabletop);group.clear();group.removeFromParent();}
 return {group,detach};
}
