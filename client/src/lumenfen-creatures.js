// Lumenfen wildlife silhouettes and six-legged locomotion.
// Authored runtime geometry is not restricted by asset source or file format.
import { fenFoliageGeometry, fenSurfaceDetail } from './lumenfen-organics.js';
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
  // Scalloped, folded fin with a raised central vein and curled membrane tip.
  const v=[],ix=[],sections=12;
  for(let i=0;i<=sections;i++){
    const t=i/sections,width=.36*Math.pow(Math.sin(Math.PI*t),.75);
    const y=t*1.05,z=.15*Math.sin(t*Math.PI)+.06*t*t;
    v.push(-width,y,z-.045,0,y,z+.072*Math.sin(Math.PI*t),width,y,z-.045);
  }
  for(let i=0;i<sections;i++){
    const a=i*3,b=a+3;ix.push(a,b,a+1,a+1,b,b+1,a+1,b+1,a+2,a+2,b+1,b+2);
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(v,3));
  g.setIndex(ix);g.computeVertexNormals();return g;
}
function bellGeometry(T) {
  // Undulating radial skirt: the animal's shape comes from geometry, not glow.
  const verts=[],indices=[],rings=8,sides=36;
  for(let j=0;j<=rings;j++){
    const t=j/rings;
    for(let i=0;i<sides;i++){
      const a=i*2*Math.PI/sides;
      const ripple=1+.065*Math.sin(a*9+t*2.3);
      const r=(.20+.82*Math.pow(t,.85))*ripple;
      const y=.60-.80*t+.09*Math.sin(a*9)*t*t;
      verts.push(Math.cos(a)*r,y,Math.sin(a)*r*.9);
    }
  }
  for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){
    const a=j*sides+i,b=j*sides+(i+1)%sides,c=a+sides,d=b+sides;
    indices.push(a,b,c,b,d,c);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));
  g.setIndex(indices);g.computeVertexNormals();return g;
}
function loft(T, rings, sides=24) {
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
  const skin=fenSurfaceDetail(new T.MeshPhysicalMaterial({color:0x2b615b,roughness:.54,metalness:.02,clearcoat:.22,clearcoatRoughness:.35}), 'hide');
  const glow=new T.MeshStandardMaterial({color:0x69b99c,roughness:.38,transparent:true,opacity:.85,
    emissive:0x329b80,emissiveIntensity:1.8,depthWrite:false});
  const membrane=new T.MeshPhysicalMaterial({color:0x6bc8ae,roughness:.3,metalness:0,
    transparent:true,opacity:.69,depthWrite:false,side:T.DoubleSide});
  const dark=new T.MeshStandardMaterial({color:0x204e48,roughness:.88});
  const bell=new T.Mesh(bellGeometry(T),skin);
  bell.scale.set(.56,.47,.61);bell.position.y=1.2;bell.name='lumenfen:lantern:fluted-mantle';group.add(bell);
  const lantern=new T.Mesh(new T.CapsuleGeometry(.16,.24,10,18),glow);
  lantern.position.y=.94;lantern.name='lumenfen:lantern:bioluminescent-core';group.add(lantern);
  const crown=new T.Mesh(fenFoliageGeometry(T,'cage'),dark);
  crown.scale.set(.38,.29,.38);crown.position.y=1.45;group.add(crown);
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
  // Fine gill threads reveal a living filter-feeder in silhouette.
  const gillMat=new T.MeshPhysicalMaterial({color:0x8dd1b7,transparent:true,opacity:.62,
    depthWrite:false,roughness:.32,side:T.DoubleSide,emissive:0x2e715c,emissiveIntensity:.45});
  const gillGeo=leafGeometry(T),gills=[];
  for(let i=0;i<9;i++){
    const a=i*2*Math.PI/9;
    const gill=new T.Mesh(gillGeo,gillMat);
    gill.scale.set(.38,.4,.5);gill.position.set(Math.sin(a)*.17,.76,Math.cos(a)*.17);
    gill.rotation.set(Math.PI+.22,a,-.15);gill.name='lumenfen:lantern:filter-gill';
    group.add(gill);gills.push(gill);
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
      glow.emissiveIntensity=1.35+active*.24*Math.sin(t*1.1);
      fins.forEach((f,i)=>{
        const phase=t*1.7+i*1.13;
        // Paired radial fin joints flex in two axes and remain centred at
        // their original roots; no accumulated rotations.
        f.rotation.z=Math.sin(phase)*.19*active;
        f.rotation.x=Math.cos(phase*.73)*.13*active;
      });
      gills.forEach((g,i)=>{
        g.rotation.z=-.15+.085*Math.sin(t*1.4+i*.67)*active;
        g.scale.y=.4*(1+Math.sin(t*1.27+i*.84)*.085*active);
      });
      whiskers.forEach((w,i)=>{
        w.rotation.z=Math.sin(t*1.25+i*1.4)*.11*active;
        w.rotation.x=Math.cos(t*.96+i*.81)*.07*active;
      });
    },
    dispose(){disposeModel(group,[skin,glow,membrane,dark,gillMat]);}
  };
}
export function makeFenStalker(T) {
  const group=new T.Group();group.name='lumenfen:bog-stalker';
  const skin=fenSurfaceDetail(new T.MeshPhysicalMaterial({color:0x354e43,roughness:.72,metalness:0,clearcoat:.24,clearcoatRoughness:.48}), 'hide');
  const shell=fenSurfaceDetail(new T.MeshPhysicalMaterial({color:0x607963,roughness:.67,metalness:.03,clearcoat:.18,clearcoatRoughness:.43,side:T.DoubleSide}), 'hide');
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
    const ridge=new T.Mesh(fenFoliageGeometry(T,'cage'),shell);
    ridge.scale.set(.28+(i%3)*.03,.25,.20);
    ridge.position.set(0,1.46+(i%2)*.05,1.03-i*.36);
    ridge.rotation.x=-.26;ridge.name='lumenfen:stalker:keratin-frill';group.add(ridge);
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
      const foot=new T.Mesh(loft(T,[
        [-.24,.12,.06,-.03],[.04,.19,.075,-.025],[.24,.18,.055,-.038],
        [.43,.105,.025,-.055],[.51,.015,.015,-.055]
      ],16),underside);
      foot.position.set(side*.21,-.45,.1);foot.name='lumenfen:stalker:splayed-foot';shin.add(foot);
      for(let toe=-1;toe<=1;toe++){
        const claw=link(T,shin,[side*.21+toe*.094,-.47,.39],
          [side*.21+toe*.112,-.50,.64-(Math.abs(toe)*.06)],.026,shell);
        claw.name='lumenfen:stalker:marsh-claw';
      }
      // Paired knee braces are articulated with the limb, not a decoration
      // fixed to the torso. Thin layered organic membranes add secondary
      // motion and retain a readable silhouette during gait.
      const brace=new T.Mesh(fenFoliageGeometry(T,'willow'),shell);
      brace.name='lumenfen:stalker:knee-membrane';
      brace.scale.set(.17,.23,.22);
      brace.position.set(side*.06,-.12,-.04);
      brace.rotation.z=side*.27;
      knee.add(brace);
      group.add(hip);legs.push({hip,knee,foot,pair,side});
    }
  }
  const tail=new T.Group();tail.position.set(0,.94,-1.3);group.add(tail);
  link(T,tail,[0,0,0],[0,-.10,-.65],.16,skin);
  const tailTip=new T.Group();tailTip.position.set(0,-.10,-.65);tail.add(tailTip);
  link(T,tailTip,[0,0,0],[0,-.15,-.47],.08,shell);
  for(let i=0;i<3;i++){
    const vane=new T.Mesh(fenFoliageGeometry(T,'willow'),shell);
    vane.name='lumenfen:stalker:tail-vane';
    vane.scale.set(.13,.2,.14);vane.position.set(0,-.06,-.15-i*.09);
    vane.rotation.set(-.28,0,i*Math.PI*2/3);
    tailTip.add(vane);
  }
  return {group,height:1.75,radius:.88,hover:0,
    update(dt,st={}){
      const speed=Math.max(0,Math.min(1,(st.speed||0)/4.5));
      const active=st.reducedMotion?0:1,gait=(st.t||0)*5.8;
      const attack=!!st.attack;
      legs.forEach(({hip,knee,foot,pair,side})=>{
        // Alternating-tripod hexapod walk: opposite middle leg pairs with
        // front/rear legs. Limb angles are absolute per frame, not incremental,
        // preventing cumulative wrist/leg rotation and unstable rest poses.
        const tripod=(pair===1?-1:1)*side;
        const phase=gait+(tripod>0?0:Math.PI);
        const stride=Math.sin(phase),lift=Math.max(0,Math.cos(phase));
        hip.rotation.x=stride*.39*speed*active;
        knee.rotation.x=(.08+lift*.59*speed)*active;
        knee.rotation.z=side*.035*(1+lift*speed)*active;
        hip.rotation.z=side*(.04+.075*speed+ (attack?.035:0));
        // Counter-pitch the metatarsus so the splayed toes don't claw upward
        // at every stance phase. All rotational limits are bounded.
        foot.rotation.x=-(hip.rotation.x+knee.rotation.x)*.78;
      });
      tail.rotation.y=Math.sin((st.t||0)*1.3)*.18*active+(attack?.06:0);
      tailTip.rotation.y=Math.sin((st.t||0)*1.3-.55)*.29*active;
      tailTip.rotation.x=Math.sin((st.t||0)*.95)*.11*active;
      jaw.position.y=.78-(attack?.065:0);
      eyes.emissiveIntensity=1.05+(st.attack ? .4 : .25)+active*.17*Math.sin((st.t||0)*1.7);
      body.rotation.z=Math.sin(gait*.5)*.025*speed*active;
    },
    dispose(){disposeModel(group,[skin,shell,underside,eyes]);}
  };
}
