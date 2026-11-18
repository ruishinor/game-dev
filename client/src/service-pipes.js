// Static service furniture. No collision, interactable or simulation state.
export function buildDeepServicePipes(T, deep) {
  const root=new T.Group();root.name='kestrel:service-pipes';root.position.set(deep.x,deep.floor,deep.z);
  const steel=new T.MeshStandardMaterial({color:0x626f70,metalness:.62,roughness:.53});
  const ins=new T.MeshStandardMaterial({color:0x82714d,roughness:.85,metalness:.08});
  const rubber=new T.MeshStandardMaterial({color:0x292f30,roughness:.93});
  const valve=new T.MeshStandardMaterial({color:0x8b503a,metalness:.36,roughness:.68});
  const cap=new T.MeshStandardMaterial({color:0xa3a095,metalness:.54,roughness:.63});
  const mats=[steel,ins,rubber,valve,cap], buckets=new Map(mats.map(m=>[m,[]]));
  const add=(geo,m,x,y,z,rz=0)=>{geo.rotateZ(rz);geo.translate(x,y,z);buckets.get(m).push(geo);};
  const cyl=(r,h,m,x,y,z,rz=0)=>add(new T.CylinderGeometry(r,r,h,16),m,x,y,z,rz);
  const box=(w,h,d,m,x,y,z)=>add(new T.BoxGeometry(w,h,d),m,x,y,z);
  for(const side of [-1,1]){
    const z=side*6, y=3.25;
    for(let i=0;i<2;i++){
      const yy=y+i*.35,r=i?.10:.14;
      for(let k=0;k<5;k++)cyl(r,2.48,i?steel:ins,-5+k*2.5,yy,z,Math.PI/2);
      for(const x of [-3.75,-1.25,1.25,3.75]){
        cyl(r+.035,.10,steel,x,yy,z,Math.PI/2);
        cyl(r+.041,.025,rubber,x,yy,z,Math.PI/2);
        for(const a of [0,Math.PI/2,Math.PI,3*Math.PI/2])cyl(.018,.125,cap,x,yy+Math.cos(a)*(r+.012),z+Math.sin(a)*(r+.012),Math.PI/2);
      }
      for(const x of [-5.6,-2.6,.4,3.4,5.6]){
        cyl(r+.019,.065,steel,x,yy,z,Math.PI/2);
        box(.13,.14,.31,steel,x,yy,z+side*.24);
      }
    }
    const x=side*1.9;
    cyl(.18,.38,steel,x,y,z,Math.PI/2);
    cyl(.10,.21,steel,x,y+.23,z);
    cyl(.15,.24,steel,x,y+.35,z,Math.PI/2);
    const wz=z-side*.21;
    add(new T.TorusGeometry(.19,.027,8,24),valve,x,y,wz);
    box(.32,.035,.035,valve,x,y,wz);
    box(.035,.32,.035,valve,x,y,wz);
    add(new T.SphereGeometry(.055,12,8),cap,x,y,wz);
  }
  // Static draw-call budget: one mesh per surface family. Strip indices
  // before merging the position and normal attributes; use the same layout.
  for(const [m,items] of buckets){
    let count=0;const list=items.map(g=>{const n=g.index?g.toNonIndexed():g;if(n!==g)g.dispose();count+=n.getAttribute('position').count;return n;});
    const vertices=new Float32Array(count*3),normals=new Float32Array(count*3);let off=0;
    for(const g of list){const p=g.getAttribute('position'),n=g.getAttribute('normal');vertices.set(p.array,off);normals.set(n.array,off);off+=p.array.length;g.dispose();}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(vertices,3));geo.setAttribute('normal',new T.BufferAttribute(normals,3));geo.computeBoundingSphere();
    const mesh=new T.Mesh(geo,m);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  }
  let disposed=false;
  return {group:root,dispose(){if(disposed)return;disposed=true;for(const m of root.children){m.geometry.dispose();m.material.dispose();}}};
}
