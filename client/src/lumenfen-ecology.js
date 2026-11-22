// Deterministic heterogeneous wetland ecology, shoreline shelves and water.
// Runtime quality and performance matter; no mesh format or donor-origin gate.
export function buildLumenfenEcology(T,group,{center,trees,pools,height,detail=1}){
  const materials={
    bark:new T.MeshStandardMaterial({color:0x38473e,roughness:.93}),
    root:new T.MeshStandardMaterial({color:0x44594b,roughness:.86}),
    hardwood:new T.MeshStandardMaterial({color:0x376452,roughness:.84,side:T.DoubleSide}),
    cage:new T.MeshStandardMaterial({color:0x548879,roughness:.74,side:T.DoubleSide,emissive:0x183a31,emissiveIntensity:.3}),
    willow:new T.MeshStandardMaterial({color:0x729b7f,roughness:.82,side:T.DoubleSide}),
    glass:new T.MeshStandardMaterial({color:0x83c6ad,roughness:.38,transparent:true,opacity:.68,
      depthWrite:false,emissive:0x266958,emissiveIntensity:.52,side:T.DoubleSide}),
    shallows:new T.MeshPhysicalMaterial({color:0x1e5258,roughness:.19,metalness:.1,transparent:true,
      opacity:.79,depthWrite:false,clearcoat:.73,clearcoatRoughness:.13,side:T.DoubleSide,
      emissive:0x102f30,emissiveIntensity:.21}),
    mud:new T.MeshStandardMaterial({vertexColors:true,roughness:.98,side:T.DoubleSide}),
    reed:new T.MeshStandardMaterial({color:0x658a64,roughness:.87,side:T.DoubleSide}),
  };
  const geometries={
    trunk:new T.CylinderGeometry(.32,.54,1,10,3),
    oak:new T.DodecahedronGeometry(1,1),
    cage:new T.ConeGeometry(1,1,8,3),
    willow:new T.ConeGeometry(1,1,9,3),
    root:new T.CylinderGeometry(.09,.24,1,7),
    vein:new T.TorusGeometry(1,.065,6,32),
    stem:new T.CylinderGeometry(.075,.11,1,6),
    pod:new T.ConeGeometry(1,1,7),
  };
  const batches=new Map(),objects=[];
  const place=(shape,mat,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0)=>{
    const key=shape+':'+mat;
    if(!batches.has(key))batches.set(key,[]);
    batches.get(key).push({x,y,z,sx,sy,sz,rx,ry,rz});
  };
  let hardwoods=0,cages=0,willows=0;
  // Each species has a different construction language and silhouette; no
  // repeated identical three-primitive tree crown across the entire map.
  for(const tree of trees){
    const species=Math.floor(Math.abs(Math.sin(tree.seed*1.733))*1000)%3;
    const {x,z,r,h,seed}=tree,y=height(x,z);
    const skew=Math.sin(seed*.31)*.11;
    place('trunk',species===1?'root':'bark',x,y+h*.4,z,
      r*(species===1?.9:.74),h*.78,r*.7,0,skew);
    if(species===0){
      hardwoods++;
      for(let j=0;j<3;j++){
        const a=j*2.3+seed*.03;
        const dx=Math.cos(a)*r*.84,dz=Math.sin(a)*r*.76;
        place('root','bark',x+dx*.4,y+h*.68,z+dz*.4,r*.28,h*.5,r*.28,
          Math.cos(a)*.33,0,Math.sin(a)*.38);
        place('oak','hardwood',x+dx,y+h*(.88+(j%2)*.045),z+dz,
          r*(1.52+(j%2)*.27),h*.19,r*(1.48+(j%3)*.09),.08*j,a);
      }
    } else if(species===1){
      cages++;
      // Buttress roots are actual supports; upper foliage forms upward cage
      // shoots rather than the hardwood's continuous rounded canopy.
      for(let j=0;j<5;j++){
        const a=j*2*Math.PI/5;
        place('root','root',x+Math.sin(a)*r*.47,y+h*.13,z+Math.cos(a)*r*.47,
          r*.28,h*.36,r*.25,Math.sin(a)*.38,0,-Math.cos(a)*.4);
      }
      for(let j=0;j<5;j++){
        const a=j*2.399+seed*.02;
        const dx=Math.sin(a)*r,dz=Math.cos(a)*r;
        place('cage','cage',x+dx,y+h*(.83+(j%3)*.05),z+dz,
          r*.63,h*.39,r*.64,.23*Math.cos(a),a,.16*Math.sin(a));
      }
      place('vein','glass',x,y+h*.64,z,r*1.1,h*.055,r*.92,Math.PI/2);
    }else{
      willows++;
      for(let j=0;j<4;j++){
        const a=j*Math.PI/2+.27+seed*.02;
        const dx=Math.cos(a)*r*1.25,dz=Math.sin(a)*r*1.24;
        place('oak','willow',x+dx*.37,y+h*.89,z+dz*.37,
          r*1.15,h*.12,r*.95,0,a);
        place('willow','willow',x+dx,y+h*.73,z+dz,
          r*.6,h*.34,r*.66,Math.PI,0,Math.sin(a)*.16);
      }
      place('oak','hardwood',x,y+h*.96,z,r*1.68,h*.13,r*1.57);
    }
  }
  // Irregular water edge and terrain-following wet shelves. Unlike perfectly
  // circular torus outlines these sit against the actual deterministic bank.
  const N=72;
  function poolMesh(pool,shelf=false){
    const vertices=[],indices=[],colors=[];
    const rings=shelf?[.94,1.12]:[.001,.23,.47,.7,.91];
    for(let j=0;j<rings.length;j++){
      for(let i=0;i<N;i++){
        const a=i*2*Math.PI/N;
        const wobble=1+.045*Math.sin(a*7+pool.seed)+.025*Math.sin(a*13+pool.seed*.17);
        const rr=rings[j]*wobble,x=pool.x+Math.cos(a)*pool.rx*rr,z=pool.z+Math.sin(a)*pool.rz*rr;
        const y=shelf?height(x,z)+.02:height(pool.x,pool.z)+.09+
          .014*Math.sin(a*4+pool.seed+j*.7);
        vertices.push(x,y,z);
        if(shelf){
          const c=new T.Color(j===0?0x536458:0x3b4c43);
          colors.push(c.r,c.g,c.b);
        }
      }
    }
    for(let j=0;j<rings.length-1;j++)for(let i=0;i<N;i++){
      const a=j*N+i,b=j*N+(i+1)%N,c=(j+1)*N+i,d=(j+1)*N+(i+1)%N;
      indices.push(a,b,c,b,d,c);
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    if(shelf)geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geo.setIndex(indices);geo.computeVertexNormals();return geo;
  }
  for(const pool of pools){
    const water=new T.Mesh(poolMesh(pool),materials.shallows);
    water.name='lumenfen:mirrorpool';water.receiveShadow=true;group.add(water);
    objects.push(water);
    const bank=new T.Mesh(poolMesh(pool,true),materials.mud);
    bank.name='lumenfen:shoreline-shelf';bank.receiveShadow=true;group.add(bank);objects.push(bank);
    for(let i=0;i<28;i++){
      const a=i*2.399+pool.seed,rad=1.02+.11*((i%5)/4);
      const x=pool.x+Math.cos(a)*pool.rx*rad,z=pool.z+Math.sin(a)*pool.rz*rad;
      const y=height(x,z),h=.6+((i*7+pool.seed)%9)*.11;
      place('cage','reed',x,y+h*.45,z,.10,h,.13,
        .07*Math.sin(a),a,.12*Math.cos(a));
    }
  }
  let spores=0;
  for(let i=0;i<145*Math.max(0,detail);i++){
    const a=i*2.399963,r=Math.sqrt((i+.5)/145),x=center.x+Math.cos(a)*r*125,z=center.z+Math.sin(a)*r*145;
    if(trees.some(t=>Math.hypot(t.x-x,t.z-z)<t.r+1.8))continue;
    const h=.21+(i%5)*.09,y=height(x,z);
    place('stem','root',x,y+h*.5,z,.53,h,.53);
    place('pod','glass',x,y+h+.12,z,.18+(i%4)*.052,.2,.18+(i%4)*.052);
    spores++;
  }
  const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3(),m=new T.Matrix4();
  for(const [key,entries]of batches){
    const [shape,mat]=key.split(':');
    const instance=new T.InstancedMesh(geometries[shape],materials[mat],entries.length);
    instance.name='lumenfen:ecology:'+key;instance.receiveShadow=true;instance.castShadow=false;
    entries.forEach((o,i)=>{
      p.set(o.x,o.y,o.z);q.setFromEuler(new T.Euler(o.rx,o.ry,o.rz));
      s.set(o.sx,o.sy,o.sz);m.compose(p,q,s);instance.setMatrixAt(i,m);
    });
    instance.instanceMatrix.needsUpdate=true;instance.computeBoundingSphere();group.add(instance);
    objects.push(instance);
  }
  return {
    stats:()=>({hardwoods,cageTrees:cages,willows,pools:pools.length,spores,instancedBatches:batches.size}),
    update(t,reducedMotion=false){
      // No source-format dependency or unnecessary full-geometry upload/frame.
      materials.glass.emissiveIntensity=reducedMotion?.52:.49+.06*Math.sin(t*.7);
    },
    dispose(){
      for(const o of objects){o.removeFromParent();if(o.geometry&&!Object.values(geometries).includes(o.geometry))o.geometry.dispose();}
      for(const g of Object.values(geometries))g.dispose();
      for(const m of Object.values(materials))m.dispose();
    }
  };
}
