// Kestrel pressure-drive rebuild. A pair of compact, vessel-mounted induction
// compressors provide a legible process-machine silhouette and a continuous
// route to the existing high-pressure feed manifold. Static art only: no
// gameplay physics, transport or simulated pressure states are implied.
export const KESTREL_MACHINERY_LIMITS = Object.freeze({
  units: 2, batchMeshes: 8, rotors: 2, conduitMeshes: 2,
  newLights: 0, colliderChanges: 0,
});

export function buildKestrelProductionMachinery(T) {
  const group = new T.Group();
  group.name = 'kestrel:production-machinery';
  const geometries = new Set(), materials = new Set(), rotors = [];
  const mat = (color, metalness, roughness, emissive = 0, emissiveIntensity = 0) => {
    const material = new T.MeshStandardMaterial({color, metalness, roughness, emissive, emissiveIntensity});
    materials.add(material);
    return material;
  };
  const iron = mat(0x26353e, .72, .54);
  const steel = mat(0x778a92, .78, .38);
  const copper = mat(0xb48c61, .70, .45);
  const gasket = mat(0x151e25, .30, .85);
  const light = mat(0x7ab8b4, .34, .42, 0x1d6f72, .82);
  const box = new T.BoxGeometry(1, 1, 1);
  const cylinder = new T.CylinderGeometry(1, 1, 1, 32, 1);
  const torus = new T.TorusGeometry(1, .08, 10, 40);
  [box, cylinder, torus].forEach(g => geometries.add(g));
  const pose = new T.Object3D();
  const cases = [], shrouds = [], stators = [], radiatorFins = [];
  const clampStruts = [], boltHeads = [], inspectionBars = [], sealRings = [];
  const cylinderFacingEast = Math.PI / 2;

  const batch = (name, geometry, material, items, castShadow = true) => {
    const object = new T.InstancedMesh(geometry, material, items.length);
    object.name = name;
    object.castShadow = castShadow;
    object.receiveShadow = true;
    for (let i = 0; i < items.length; i++) {
      const [x,y,z,sx,sy,sz,rx=0,ry=0,rz=0] = items[i];
      pose.position.set(x,y,z);
      pose.scale.set(sx,sy,sz);
      pose.rotation.set(rx,ry,rz);
      pose.updateMatrix();
      object.setMatrixAt(i,pose.matrix);
    }
    object.instanceMatrix.needsUpdate = true;
    object.computeBoundingSphere();
    group.add(object);
    return object;
  };

  const conduit = (name, points, radius, material) => {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
    const geometry = new T.TubeGeometry(curve, 34, radius, 10, false);
    geometries.add(geometry);
    const object = new T.Mesh(geometry,material);
    object.name = name;
    object.castShadow = true;
    object.receiveShadow = true;
    group.add(object);
    return object;
  };

  // Original containment vessels are at x=-4.1, z=-4/+4 relative to DEEP;
  // the upper drive is seated over the vessel head and stays above the route.
  for (const [index,z] of [-4,4].entries()) {
    const y = 3.28;
    cases.push([-4.18,y,z,.68,.97,.68,0,0,cylinderFacingEast]);
    shrouds.push([-4.7,y,z,.66,.11,.66,0,0,cylinderFacingEast]);
    stators.push([-3.69,y,z,.755,.755,.755,0,Math.PI/2]);
    sealRings.push([-3.61,y,z,.56,.56,.56,0,Math.PI/2]);
    for (const x of [-4.55,-4.34,-4.13,-3.92]) {
      radiatorFins.push([x,y,z,.74,.74,.74,0,Math.PI/2]);
    }
    for (const dz of [-.46,.46]) {
      clampStruts.push([-4.26,2.86,z+dz,.16,.73,.13]);
    }
    for (let i=0;i<12;i++) {
      const a=i*Math.PI/6;
      boltHeads.push([-3.635,y+Math.sin(a)*.685,z+Math.cos(a)*.685,
        .07,.078,.078,0,0,Math.PI/2]);
    }
    for (let i=0;i<4;i++) {
      inspectionBars.push([-3.62,y+.43+i*.095,z+.40,.018,.055,.12]);
    }
    conduit('kestrel:compressor-to-feed',[
      [-4.72,3.50,z],[-4.96,3.68,z],[-5.18,3.83,z],
      [-5.35,3.72,z],
    ],.105,copper);

    const rotorGroup = new T.Group();
    rotorGroup.name = 'kestrel:compressor-impeller:'+index;
    rotorGroup.position.set(-3.55,y,z);
    const bladeGeometry = new T.BoxGeometry(1,1,1);
    geometries.add(bladeGeometry);
    const blades = new T.InstancedMesh(bladeGeometry,steel,8);
    blades.name = 'kestrel:compressor-blades';
    blades.castShadow = true;
    for (let i=0;i<8;i++) {
      const a=i*Math.PI/4;
      pose.position.set(0,Math.cos(a)*.32,Math.sin(a)*.32);
      pose.scale.set(.062,.32,.145);
      pose.rotation.set(a+.65,0,.15);
      pose.updateMatrix();
      blades.setMatrixAt(i,pose.matrix);
    }
    blades.instanceMatrix.needsUpdate = true;
    blades.computeBoundingSphere();
    rotorGroup.add(blades);
    const hubGeometry = new T.CylinderGeometry(.18,.18,.14,20);
    geometries.add(hubGeometry);
    const hub = new T.Mesh(hubGeometry,copper);
    hub.name = 'kestrel:compressor-axle';
    hub.rotation.z = Math.PI/2;
    hub.castShadow = true;
    rotorGroup.add(hub);
    group.add(rotorGroup);
    rotors.push(rotorGroup);
  }

  batch('kestrel:compressor-pressure-shells',cylinder,iron,cases);
  batch('kestrel:compressor-rear-caps',cylinder,gasket,shrouds);
  batch('kestrel:compressor-stator-rings',torus,copper,stators);
  batch('kestrel:compressor-gasket-rings',torus,gasket,sealRings);
  batch('kestrel:compressor-heat-fins',torus,steel,radiatorFins);
  batch('kestrel:compressor-saddle-braces',box,steel,clampStruts);
  batch('kestrel:compressor-face-bolts',cylinder,copper,boltHeads,false);
  batch('kestrel:compressor-status-bars',box,light,inspectionBars,false);

  return {
    group,
    stats: {...KESTREL_MACHINERY_LIMITS, drawMeshes:group.children.reduce((n,o) =>
      n+(o.isMesh?1:0)+(o.isGroup?o.children.filter(c=>c.isMesh).length:0),0)},
    update(t,{reducedMotion=false}={}) {
      rotors.forEach((rotor,i) => {
        rotor.rotation.x = reducedMotion ? 0 : t*.55*(i%2?-1:1);
      });
    },
    dispose() {
      group.removeFromParent();
      for (const geo of geometries) geo.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
