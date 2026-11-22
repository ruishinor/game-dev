// Kestrel Deep: GLB-based industrial dressing and original pressure-lab detailing.
// Presentation only. The authoritative floor, roof, three walls, vessels and
// traversal/line-of-sight footprints remain in shared/world.js.
export const KESTREL_KIT_PIECES = Object.freeze([
  'Column_Hollow', 'Prop_Computer', 'Prop_Cable_1',
  'Prop_Vent_Big', 'Prop_Light_Floor',
]);

export function buildKestrelDeepVisuals(T, deep, assets, options = {}) {
  const root = new T.Group();
  root.name = 'kestrel:visual-reconstruction';
  root.position.set(deep.x, deep.floor, deep.z);
  const detail = Math.max(0, Math.min(1, options.detail ?? 1));
  const calm = typeof options.reducedMotion === 'function' ? options.reducedMotion : () => false;
  const material = (color, metalness, roughness, emissive, emissiveIntensity = 0) =>
    new T.MeshStandardMaterial({ color, metalness, roughness, emissive: emissive ?? 0x000000, emissiveIntensity });
  const basalt = material(0x293438, .34, .88);
  const rib = material(0x526268, .75, .42);
  const alloy = material(0x778184, .74, .39);
  const bronze = material(0x9d8259, .59, .54);
  const gasket = material(0x111b20, .21, .91);
  const frost = material(0x7ba9a8, .37, .47, 0x1d6567, .38);
  const signal = material(0x79c2bf, .19, .40, 0x2ba9a7, 1.6);
  const warning = material(0xd1a874, .44, .58, 0x724a16, .2);
  const pulseMaterials = [signal, frost];
  const box = new T.BoxGeometry(1, 1, 1);
  const dummy = new T.Object3D();
  const plates = (name, mat, placements, shadow = true) => {
    const inst = new T.InstancedMesh(box, mat, placements.length);
    inst.name = name; inst.castShadow = shadow; inst.receiveShadow = true;
    placements.forEach(([x,y,z,w,h,d,ry=0],i) => {
      dummy.position.set(x,y,z); dummy.rotation.set(0,ry,0);
      dummy.scale.set(w,h,d); dummy.updateMatrix(); inst.setMatrixAt(i,dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    root.add(inst);
    return inst;
  };
  // Clad the three existing solid walls rather than placing obstacles in the
  // open east entry or changing authoritative collision and cover.
  const wallCells=[],wallSeams=[],fixings=[],wallLights=[];
  for (const side of [-1,1]) {
    const z = side * (deep.hd - .18);
    for (let i=0;i<6;i++) {
      const x = -5.95 + i*2.32;
      wallCells.push([x,2.33,z,2.18,4.34,.12]);
      wallSeams.push([x,2.33,z-side*.082,1.98,.042,.05]);
      for (const y of [.38,4.32]) for (const dx of [-.91,.91])
        fixings.push([x+dx,y,z-side*.14,.11,.10,.04]);
      wallLights.push([x,3.74,z-side*.15,1.45,.035,.04]);
    }
  }
  for(let i=0;i<6;i++) {
    const z=-5.5+i*2.2;
    wallCells.push([-deep.hw+.18,2.32,z,.14,4.31,2.06]);
    wallSeams.push([-deep.hw+.085,2.32,z,.05,.045,1.72]);
  }
  plates('kestrel:bulkhead-cassettes',basalt,wallCells);
  plates('kestrel:bulkhead-stiffeners',rib,wallSeams);
  plates('kestrel:bolted-fixings',bronze,fixings,false);
  plates('kestrel:diagnostic-wall-strips',frost,wallLights,false);
  // Floor detail is deliberately sub-centimetre-thin and cosmetic; it is not
  // elevated decking or a second walkable floor on the single-heightfield map.
  const deck=[],inlay=[],fasteners=[];
  for(let i=0;i<9;i++)for(let j=0;j<7;j++) {
    const x=-5.65+i*1.38, z=-5.55+j*1.83;
    if(Math.abs(x+4.1)<1.0&&(Math.abs(z+4)<1.15||Math.abs(z-4)<1.15))continue;
    deck.push([x,.091,z,1.31,.018,1.73]);
    if(i%2===0)inlay.push([x,.104,z+ .78,1.17,.008,.025]);
    if(j%2===0)fasteners.push([x+.56,.105,z+.69,.052,.014,.062]);
  }
  plates('kestrel:machined-floor-tiles',rib,deck,false);
  plates('kestrel:inlaid-deck-lines',gasket,inlay,false);
  plates('kestrel:recessed-deck-fasteners',alloy,fasteners,false);
  const overhead=[],trusses=[],rails=[];
  for(let i=0;i<7;i++) {
    const x=-6.2+i*2.06;
    overhead.push([x,5.43,0,.23,.43,12.2]);
    rails.push([x,5.18,-6.12,.18,.14,.18],[x,5.18,6.12,.18,.14,.18]);
  }
  for(const side of [-1,1]) {
    trusses.push([-.2,5.22,side*5.98,12.4,.23,.27]);
    for(const x of [-6.5,6.5])trusses.push([x,2.9,side*6.25,.24,5.4,.31]);
  }
  plates('kestrel:roof-crossbeams',alloy,overhead);
  plates('kestrel:roof-perimeter-rails',bronze,trusses);
  plates('kestrel:fastened-roof-joints',gasket,rails);
  // Physical mechanical modules already in the production GLB manifest:
  // use loaded models as recognizable machinery rather than fake silhouette
  // boxes. Their anchors overlap the existing wall/roof footprint, not lanes.
  const glbPieces = [];
  if (assets?.get?.('sanctum')) {
    const kit = (piece, x, y, z, sx, sy, sz, rx=0,ry=0,rz=0) => {
      try {
        const obj = assets.instance('sanctum',piece);
        if (!obj) return;
        obj.name = 'kestrel:glb:' + piece;
        obj.position.set(x,y,z); obj.scale.set(sx,sy,sz);
        obj.rotation.set(rx,ry,rz);
        root.add(obj); glbPieces.push(obj);
      } catch (err) {
        console.warn('[kestrel] optional kit piece unavailable:',piece,err);
      }
    };
    for(const side of [-1,1]) {
      for(const x of [-4.7,3.7])
        kit('Prop_Vent_Big',x,4.4,side*6.27,.67,.67,.50,Math.PI/2);
      for(const x of [-4.6,-.3,4.0])
        kit('Prop_Light_Floor',x,.11,side*5.65,.73,.66,.68);
      for(const x of [-6.52,6.52])
        kit('Column_Hollow',x,0,side*6.32,.32,1.04,.31);
    }
    for(const x of [-3.9,-.7,2.5])
      kit('Prop_Cable_1',x,5.02,-2.6,.75,.4,.66);
    for(const z of [-2.65,2.65])
      kit('Prop_Computer',-6.76,1.35,z,.29,.82,.35,0,Math.PI/2);
  }
  // Rebuilt pressure-coupling instrument: retained GLB computers are given a
  // coherent instrument panel, guarded coil and physically legible readouts.
  // Thin instrument surfaces are mounted on the existing western bulkhead.
  const sockets=[],faces=[],numbers=[],cords=[];
  for (const z of [-2.65,2.65]) {
    sockets.push([-6.79,2.18,z,.18,1.42,1.15]);
    faces.push([-6.68,2.4,z,.025,.68,.78]);
    for(let j=0;j<7;j++)numbers.push([-6.65,2.15+j*.085,z-.29+j*.05,.012,.018,.14]);
    for(const dz of [-.43,.43]) cords.push([-6.77,1.38,z+dz,.11,1.12,.055]);
  }
  plates('kestrel:console-frames',alloy,sockets);
  plates('kestrel:console-glass',frost,faces,false);
  plates('kestrel:console-diagnostic-bars',signal,numbers,false);
  plates('kestrel:console-cable-shrouds',gasket,cords);
  // Distinctive high-pressure rings encircle the two authoritative containment
  // vessels only. No additional interactable specimen, collider or reward.
  const ringGeo=new T.TorusGeometry(1.07,.026,8,56);
  const pressureRings=[];
  for(const z of [-4,4]){
    for(const y of [.65,1.73,2.45]) {
      const hoop=new T.Mesh(ringGeo,y===1.73?signal:bronze);
      hoop.name='kestrel:pressure-diagnostic';
      hoop.position.set(-4.1,y,z);
      hoop.rotation.x=Math.PI/2;
      hoop.castShadow=false;
      root.add(hoop); pressureRings.push(hoop);
    }
  }
  // Lightweight drifting motes in the containment corner. Bounded to the
  // existing vessels, independent of world/encounter/ability VFX.
  const moteCount=detail>.65?44:detail>.3?16:0;
  const moteGeo=new T.BufferGeometry();
  const motePositions=new Float32Array(moteCount*3);
  for(let i=0;i<moteCount;i++){
    const q=i*.6180339887499,a=q*Math.PI*2;
    motePositions[i*3]=-4.1+Math.cos(a)*(.25+(i%6)*.13);
    motePositions[i*3+1]=.55+(i*17%29)/29*2.2;
    motePositions[i*3+2]=(i%2?4:-4)+Math.sin(a)*(.25+(i%6)*.13);
  }
  moteGeo.setAttribute('position',new T.BufferAttribute(motePositions,3));
  const moteMat=new T.PointsMaterial({color:0x73dad2,size:.065,transparent:true,opacity:.45,
    depthWrite:false,blending:T.AdditiveBlending});
  const motes=new T.Points(moteGeo,moteMat);
  motes.name='kestrel:containment-aerosols';
  motes.frustumCulled=false;
  root.add(motes);
  const glowLamp=new T.PointLight(0x8fcac4, detail>.6?12:0,7,2);
  glowLamp.name='kestrel:pressure-glow';
  glowLamp.position.set(-4.3,3,0);
  glowLamp.castShadow=false;
  root.add(glowLamp);
  const baseGlow=signal.emissiveIntensity;
  function update(_dt,t,focus) {
    // Keep the additional lamp and particles local rather than lighting the
    // entire region or incurring overdraw when the player is elsewhere.
    const nearby=focus && Math.hypot(focus.x-deep.x,focus.z-deep.z)<29;
    root.visible = !focus || Math.hypot(focus.x-deep.x,focus.z-deep.z)<90;
    if(!root.visible)return;
    const phase=calm()? .74 : .76+.24*Math.sin(t*.8);
    signal.emissiveIntensity=baseGlow*phase;
    frost.emissiveIntensity=.32+.08*phase;
    glowLamp.intensity=nearby&&detail>.6?12*phase:0;
    motes.visible=!!nearby&&moteCount>0;
    if(motes.visible && !calm()) motes.position.y=Math.sin(t*.24)*.08;
    moteMat.opacity=calm()?.32:.32+.12*phase;
  }
  return {group:root,update,stats:{kitPieces:glbPieces.length,motes:moteCount,colliderChanges:0},materials:pulseMaterials};
}
