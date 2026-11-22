// Lumenfen wildlife silhouettes and six-legged locomotion.
// Authored runtime geometry is not restricted by asset source or file format.
function disposeModel(group, materials) {
  const geometries = new Set();
  group.traverse(o => { if (o.isMesh && o.geometry) geometries.add(o.geometry); });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}
function link(T, parent, start, end, radius, material) {
  const a = new T.Vector3(...start), b = new T.Vector3(...end);
  const axis = b.clone().sub(a), length = axis.length();
  const mesh = new T.Mesh(new T.CylinderGeometry(radius*.86,radius,length,8,1),material);
  mesh.position.copy(a.add(b).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize());
  parent.add(mesh);
  return mesh;
}
function leafGeometry(T) {
  // A curved two-sided frond with clear tapered outline, not a spherical VFX orb.
  const verts = new Float32Array([
    0,0,0, -.35,.38,-.06, 0,1.1,.12,
    0,0,0, 0,1.1,.12, .35,.38,.07,
  ]);
  const g = new T.BufferGeometry();
  g.setAttribute('position',new T.BufferAttribute(verts,3));
  g.computeVertexNormals();
  return g;
}
function loft(T, rings, sides=12) {
  const vertices=[], indices=[];
  for(const [z,width,height,cy] of rings) for(let i=0;i<sides;i++){
    const a=i*Math.PI*2/sides;
    vertices.push(Math.sin(a)*width,cy+Math.cos(a)*height,z);
  }
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<sides;i++){
    const a=j*sides+i,b=j*sides+(i+1)%sides,c=(j+1)*sides+i,d=(j+1)*sides+(i+1)%sides;
    indices.push(a,c,b,b,c,d);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  g.setIndex(indices);g.computeVertexNormals();return g;
}
export function makeFenLantern(T){
  const group=new T.Group();group.name='lumenfen:lantern-drifter';
  const skin=new T.MeshStandardMaterial({color:0x2b615b,roughness:.62,metalness:.04});
  const glow=new T.MeshStandardMaterial({color:0x69b99c,roughness:.38,transparent:true,opacity:.85,
    emissive:0x329b80,emissiveIntensity:1.8,depthWrite:false});
  const membrane=new T.MeshPhysicalMaterial({color:0x6bc8ae,roughness:.3,metalness:0,
    transparent:true,opacity:.69,depthWrite:false,side:T.DoubleSide});
  const dark=new T.MeshStandardMaterial({color:0x204e48,roughness:.88});
  const bell=new T.Mesh(new T.SphereGeometry(1,18,12),skin);
  bell.scale.set(.5,.28,.57);bell.position.y=1.15;group.add(bell);
  const lantern=new T.Mesh(new T.SphereGeometry(1,16,10),glow);
  lantern.scale.set(.28,.38,.3);lantern.position.y=.94;group.add(lantern);
  const crown=new T.Mesh(new T.ConeGeometry(.32,.4,12),dark);
  crown.position.y=1.45;group.add(crown);
  const finGeo=leafGeometry(T), fins=[];
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    const fin=new T.Group();fin.name='lumenfen:lantern:fin';fin.position.set(Math.sin(a)*.32,1.12,Math.cos(a)*.32);
    fin.rotation.y=a;
    const surface=new T.Mesh(finGeo,membrane);
    surface.scale.set(1.1,.82,1);surface.rotation.z=Math.PI/2-.23;
    fin.add(surface);
    group.add(fin);fins.push(fin);
  }
  const whiskers=[];
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2;
    const limb=new T.Group();
    limb.position.set(Math.sin(a)*.24,.8,Math.cos(a)*.24);
    link(T,limb,[0,0,0],[Math.sin(a)*.12,-.65,Math.cos(a)*.12],.035,dark);
    const seed=new T.Mesh(new T.SphereGeometry(.06,8,6),glow);
    seed.position.set(Math.sin(a)*.12,-.65,Math.cos(a)*.12);limb.add(seed);
    group.add(limb);whiskers.push(limb);
  }
  return {group,height:1.65,radius:.65,hover:.4,
    update(dt,st={}){
      const t=st.t||0,active=st.reducedMotion?0:1;
      group.position.y=.21+active*.12*Math.sin(t*1.4);
      bell.rotation.y+=Math.max(0,dt||0)*.14*active;
      fins.forEach((f,i)=>{f.rotation.z=Math.sin(t*1.7+i*1.13)*.17*active;});
      whiskers.forEach((w,i)=>{w.rotation.z=Math.sin(t*1.25+i*1.4)*.11*active;});
    },
    dispose(){disposeModel(group,[skin,glow,membrane,dark]);}
  };
}
export function makeFenStalker(T) {
  const group=new T.Group();group.name='lumenfen:bog-stalker';
  const skin=new T.MeshStandardMaterial({color:0x354e43,roughness:.87,metalness:0,flatShading:false});
  const shell=new T.MeshStandardMaterial({color:0x607963,roughness:.73,metalness:.03});
  const underside=new T.MeshStandardMaterial({color:0x243d38,roughness:.95});
  const eyes=new T.MeshStandardMaterial({color:0x8be1b4,emissive:0x4eae84,emissiveIntensity:1.5,roughness:.38});
  const body=new T.Mesh(loft(T,[
    [-1.4,.10,.13,.92],[-1.16,.37,.36,.94],[-.63,.63,.52,.96],
    [0,.67,.49,.99],[.65,.57,.44,1.01],[1.18,.48,.40,.94],[1.45,.12,.17,.90]
  ]),skin);
  body.name='lumenfen:stalker:anatomical-torso';group.add(body);
  const belly=new T.Mesh(new T.SphereGeometry(1,18,12),underside);
  belly.scale.set(.52,.19,1.02);belly.position.set(0,.69,.09);group.add(belly);
  const neck=new T.Mesh(new T.SphereGeometry(1,14,10),skin);
  neck.scale.set(.41,.35,.43);neck.position.set(0,1.0,1.25);group.add(neck);
  const head=new T.Mesh(loft(T,[
    [1.05,.25,.23,1.02],[1.35,.40,.28,1.06],
    [1.7,.32,.22,1.0],[1.95,.18,.14,.92],[2.03,.025,.04,.9]
  ]),shell);
  head.name='lumenfen:stalker:profile';group.add(head);
  const jaw=new T.Mesh(new T.SphereGeometry(1,12,8),underside);
  jaw.scale.set(.3,.09,.43);jaw.position.set(0,.78,1.6);group.add(jaw);
  for(const side of [-1,1]){
    const eye=new T.Mesh(new T.SphereGeometry(.085,10,8),eyes);
    eye.position.set(side*.31,1.12,1.61);group.add(eye);
    // Tympanic ridges run backward from the eyes, like a marsh predator.
    link(T,group,[side*.3,1.12,1.47],[side*.38,1.13,.93],.05,shell);
  }
  for(let i=0;i<7;i++){
    const ridge=new T.Mesh(new T.ConeGeometry(.16+(i%3)*.025,.39,5),shell);
    ridge.position.set(0,1.46+(i%2)*.05,1.03-i*.36);
    ridge.rotation.x=-.26;group.add(ridge);
  }
  const legs=[];
  for(let pair=0;pair<3;pair++){
    const z=.94-pair*.88;
    for(const side of [-1,1]){
      const hip=new T.Group();hip.name='lumenfen:stalker:leg';
      hip.position.set(side*(.48+(pair===1?.12:0)),.89,z);
      link(T,hip,[0,0,0],[side*.43,-.34,.02],.19,skin);
      const knee=new T.Group();knee.position.set(side*.43,-.34,.02);hip.add(knee);
      const shin=new T.Group();knee.add(shin);
      link(T,shin,[0,0,0],[side*.18,-.42,-.07],.13,shell);
      const foot=new T.Mesh(new T.BoxGeometry(.3,.09,.44),underside);
      foot.position.set(side*.21,-.45,.1);shin.add(foot);
      group.add(hip);legs.push({hip,knee,pair,side});
    }
  }
  const tail=new T.Group();tail.position.set(0,.94,-1.3);group.add(tail);
  link(T,tail,[0,0,0],[0,-.10,-.65],.16,skin);
  link(T,tail,[0,-.10,-.65],[0,-.25,-1.12],.08,shell);
  return {group,height:1.75,radius:.88,hover:0,
    update(dt,st={}){
      const speed=Math.max(0,Math.min(1,(st.speed||0)/4.5));
      const active=st.reducedMotion?0:1,gait=(st.t||0)*5.8;
      legs.forEach(({hip,knee,pair,side})=>{
        const phase=gait+pair*2*Math.PI/3+(side>0?Math.PI:0);
        hip.rotation.x=Math.sin(phase)*.42*speed*active;
        knee.rotation.x=Math.max(0,Math.cos(phase))*.26*speed*active;
        hip.rotation.z=side*(.04+.04*speed);
      });
      tail.rotation.y=Math.sin((st.t||0)*1.3)*.2*active;
      body.rotation.z=Math.sin(gait*.5)*.025*speed*active;
    },
    dispose(){disposeModel(group,[skin,shell,underside,eyes]);}
  };
}
