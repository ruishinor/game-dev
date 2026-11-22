// Site-specific, collision-aligned landmark composition for Lumenfen.
// Real structures and ecological identity, independent of mesh provenance.
import { FEN_SITES, fenHeight } from '../../shared/lumenfen.js';

export function buildLumenfenSites(T) {
  const group = new T.Group();
  group.name = 'lumenfen:sites';
  const mats = {
    wood: new T.MeshStandardMaterial({ color: 0x514539, roughness: .91 }),
    pale: new T.MeshStandardMaterial({ color: 0x83735d, roughness: .89 }),
    stone: new T.MeshStandardMaterial({ color: 0x53675f, roughness: .96 }),
    moss: new T.MeshStandardMaterial({ color: 0x366653, roughness: .94 }),
    brass: new T.MeshStandardMaterial({ color: 0x8a7851, metalness: .65, roughness: .48 }),
    glass: new T.MeshPhysicalMaterial({ color: 0x78c7b2, metalness: .08, roughness: .18,
      transparent: true, opacity: .77, depthWrite: false, emissive: 0x2b756a, emissiveIntensity: .28,
      side: T.DoubleSide }),
    leaf: new T.MeshStandardMaterial({ color: 0x557e65, roughness: .85, side: T.DoubleSide }),
  };
  const geometry = {
    box: new T.BoxGeometry(1, 1, 1),
    column: new T.CylinderGeometry(1, 1, 1, 9),
    stone: new T.IcosahedronGeometry(1, 1),
    leaf: new T.ConeGeometry(1, 1, 5),
  };
  const moving = [], siteNames = [];
  const Y = new T.Vector3(0, 1, 0), matrix = new T.Matrix4();
  const position = new T.Vector3(), quaternion = new T.Quaternion(), scale = new T.Vector3();
  for (const site of FEN_SITES) {
    const root = new T.Group();
    root.name = 'lumenfen:site:' + site.id;
    root.position.set(site.x, fenHeight(site.x, site.z), site.z);
    group.add(root); siteNames.push(root.name);
    const batches = [];
    const put = (geo, material, x, y, z, sx, sy, sz, rz = 0, ry = 0) => {
      batches.push({ geo, material, x, y, z, sx, sy, sz, rz, ry });
    };
    const box = (kind, x, y, z, sx, sy, sz, rz = 0, ry = 0) =>
      put('box', kind, x, y, z, sx, sy, sz, rz, ry);
    const stone = (x, y, z, sx, sy, sz) => put('stone', 'stone', x, y, z, sx, sy, sz);
    const leaf = (x, y, z, sx, sy, sz, rz = 0) => put('leaf', 'leaf', x, y, z, sx, sy, sz, rz);
    const column = (kind, x, y, z, sx, sy, sz) => put('column', kind, x, y, z, sx, sy, sz);
    const rootLine = (points, thickness = .13, kind = 'wood') => {
      const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
      const mesh = new T.Mesh(new T.TubeGeometry(curve, 24, thickness, 6, false), mats[kind]);
      mesh.name = 'lumenfen:braided-root'; root.add(mesh);
    };
    const reeds = (x, z, count = 9) => {
      for (let i = 0; i < count; i++) {
        const a = i * 2.399, rad = .15 + (i % 4) * .19;
        const h = .65 + (i % 5) * .16;
        leaf(x + Math.cos(a) * rad, h / 2, z + Math.sin(a) * rad, .12, h, .11, Math.sin(i) * .22);
      }
    };
    if (site.id === 'veil-landing') {
      // Repaired landing stones and braided threshold roots; not a second portal.
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI * 2 / 7, r = 4.4 + .4 * Math.sin(i * 2);
        stone(Math.cos(a)*r, .7, Math.sin(a)*r, 1.1, 1.4+(i%3)*.37, .8);
        rootLine([[Math.cos(a)*r, .3, Math.sin(a)*r],[Math.cos(a)*r*.68,.22,Math.sin(a)*r*.7],
          [Math.cos(a)*r*.4,.12,Math.sin(a)*r*.45]], .14);
        reeds(Math.cos(a)*(r+1),Math.sin(a)*(r+1),6);
      }
      box('pale', 0, .08, 0, 4.8, .16, 3.3);
      for(let j=-2;j<=2;j++)box('stone',j*.85,.19,-.65,.18,.23,2.4);
    } else if (site.id === 'mossbound-thicket') {
      // Old trees, organic graft ribs, and materially distinct layered foliage.
      for(let i=0;i<5;i++){
        const a=i*2.399,r=2.7+(i%2)*1.9,x=Math.cos(a)*r,z=Math.sin(a)*r;
        column('wood',x,3.2,z,.62,6.4,.72);
        stone(x,.42,z,.85,.58,1.05);
        for(let j=0;j<3;j++){
          rootLine([[x,.2,z],[x+Math.sin(j*2.1)*1.5,1.2,z+Math.cos(j*2.1)*1.1],
            [x+Math.sin(j*2.1)*2.2,4.3+j*.5,z+Math.cos(j*2.1)*2]],.13,'moss');
          leaf(x+Math.sin(j*2.1)*1.5,6.5+j*.42,z+Math.cos(j*2.1)*1.5,2.9,1.45,2.7);
        }
      }
      for(let i=0;i<6;i++)reeds(Math.cos(i*1.7)*6,Math.sin(i*1.7)*6,7);
    } else if (site.id === 'glasswater-spring') {
      // A coherent working crossing: leveled decking, supported piers, simple
      // channel instrumentation and a recognizable local water mirror.
      const water = new T.Mesh(new T.CircleGeometry(1,48),mats.glass);
      water.rotation.x = -Math.PI/2; water.scale.set(8,5.3,1); water.position.y=.11;
      water.name='lumenfen:spring:water';root.add(water);
      for(let j=-8;j<=8;j++){
        box(j%4===0?'pale':'wood',j*.78,.34,0,.68,.2,3.7);
        if(j%4===0){
          for(const z of [-1.65,1.65]){
            column('wood',j*.78,-.35,z,.22,1.45,.22);
            column('pale',j*.78,1.2,z,.11,1.3,.11);
          }
        }
      }
      for(const z of [-1.65,1.65])box('pale',0,1.76,z,13,.12,.12);
      for(let i=0;i<6;i++)stone(Math.cos(i*1.85)*8,.14,Math.sin(i*1.85)*5.4,
        1.45,.47,1.15);
      // Instrument: calibration vessel, dial and worked bronze ribs.
      column('stone',7.5,.5,-2.7,1.05,1.0,1.05);
      column('brass',7.5,1.4,-2.7,.52,.8,.52);
      const dial=new T.Mesh(new T.TorusGeometry(.77,.065,6,28),mats.brass);
      dial.name='lumenfen:spring:hydrology-dial';dial.rotation.x=.22;
      dial.position.set(7.5,2.1,-2.7);root.add(dial);
      for(const z of [-4,4])for(let x=-6;x<=6;x+=3)reeds(x,z,5);
    } else if (site.id === 'root-crown-hollow') {
      // Observatory: angular hand-built timber, stone base, grown-in roots,
      // sloped roof and one readable resonance survey instrument.
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4,r=5.4,x=Math.cos(a)*r,z=Math.sin(a)*r;
        stone(x,.48,z,1.3,.95,1.4);
        column('wood',x,2.8,z,.38,5.3,.38);
        rootLine([[x*.85,.14,z*.85],[x,.5,z],[x*.98,3,z*.95]],.18,'moss');
      }
      box('pale',0,5.7,-3.1,12,.28,6,.34);
      box('wood',0,5.7,3.1,12,.28,6,-.34);
      box('wood',0,6.7,0,12.7,.35,.3);
      for(let x=-5;x<=5;x+=2.5)box('brass',x,3.15,-5.5,.19,2.5,.24);
      // Gimbaled azimuth rings: a distinctive instrument, not a generic dome.
      const instrument=new T.Group();
      instrument.name='lumenfen:observatory:resonance-armillary';
      instrument.position.set(0,3.35,0);root.add(instrument);
      for(const [rad,rx,ry] of [[1.4,Math.PI/2,.15],[1.1,.28,Math.PI/2],[.8,.7,.38]]){
        const ring=new T.Mesh(new T.TorusGeometry(rad,.064,7,48),mats.brass);
        ring.rotation.set(rx,ry,.12);instrument.add(ring);
      }
      instrument.add(new T.Mesh(new T.IcosahedronGeometry(.38,2),mats.glass));
      moving.push({object:instrument,kind:'armillary'});
      for(let i=0;i<6;i++)reeds(Math.cos(i*1.04)*7,Math.sin(i*1.04)*7,5);
    } else if (site.id === 'tidal-weir') {
      // Sluice masonry with recognizable moving bucket-work machinery.
      for(const x of [-6.4,6.4]){
        box('stone',x,.8,0,1.7,2.2,8.2);
        for(const z of [-3.6,3.6])stone(x,1.65,z,.85,.46,.85);
      }
      for(let j=-3;j<=3;j++)box('wood',j*.68,.65,0,.54,1.6,5.8);
      for(const z of [-2.8,2.8])box('pale',0,1.45,z,14,.28,.42);
      for(let x=-5;x<=5;x+=2)box('brass',x,1.5,0,.12,2.1,.2);
      const wheel=new T.Group();
      wheel.name='lumenfen:weir:wheel';wheel.position.set(8,2.2,0);root.add(wheel);
      for(const x of [-.36,.36]){
        const rim=new T.Mesh(new T.TorusGeometry(2,.14,8,36),mats.wood);
        rim.position.x=x;rim.rotation.y=Math.PI/2;wheel.add(rim);
      }
      const axle=new T.Mesh(new T.CylinderGeometry(.24,.24,1.5,12),mats.brass);
      axle.rotation.z=Math.PI/2;wheel.add(axle);
      for(let i=0;i<10;i++){
        const a=i*2*Math.PI/10;
        const spoke=new T.Mesh(new T.BoxGeometry(.9,.17,4.15),mats.pale);
        spoke.rotation.x=a;wheel.add(spoke);
        const paddle=new T.Mesh(new T.BoxGeometry(1.2,.85,.14),mats.wood);
        paddle.position.set(0,Math.sin(a)*1.98,Math.cos(a)*1.98);
        paddle.rotation.x=a;wheel.add(paddle);
      }
      moving.push({object:wheel,kind:'wheel'});
      for(let i=0;i<6;i++)reeds(Math.cos(i*2.2)*10,Math.sin(i*2.2)*6,6);
    } else if (site.id === 'luminous-canopy') {
      // Strong upward silhouette: tapered standing roots, overhanging fronds,
      // and suspended glass fruit instead of the default rounded tree crowns.
      for(let i=0;i<7;i++){
        const a=i*2.399,r=2.7+(i%3)*1.4,x=Math.cos(a)*r,z=Math.sin(a)*r;
        column('wood',x,6.5,z,.55,13,.62);
        rootLine([[x,.12,z],[x*.82,5,z*.82],[x*.42,11.2,z*.42],
          [x*.35,14,z*.36]],.24,'moss');
        leaf(x*.5,13.2,z*.5,4.3,2.0,3.5,(i%2?.38:-.38));
        column('glass',x*.55,11.3,z*.55,.28,1.4,.28);
      }
      for(let i=0;i<10;i++)reeds(Math.cos(i*1.8)*8,Math.sin(i*1.8)*8,6);
    }
    // Draw repeated beams/stones/foliage in a small number of calls per site.
    for(const key of new Set(batches.map(b=>b.geo+'|'+b.material))){
      const [geo,material]=key.split('|'), entries=batches.filter(b=>b.geo===geo&&b.material===material);
      const mesh=new T.InstancedMesh(geometry[geo],mats[material],entries.length);
      mesh.name='lumenfen:detail:'+site.id+':'+key;mesh.castShadow=false;mesh.receiveShadow=true;
      entries.forEach((b,i)=>{
        position.set(b.x,b.y,b.z);
        quaternion.setFromEuler(new T.Euler(0,b.ry,b.rz));
        scale.set(b.sx,b.sy,b.sz);
        matrix.compose(position,quaternion,scale);mesh.setMatrixAt(i,matrix);
      });
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
      root.add(mesh);
    }
  }
  return {
    group, stats:()=>({sites:siteNames.slice(),movingMechanisms:moving.length}),
    update(dt,reducedMotion=false){
      if(reducedMotion)return;
      const step=Math.max(0,Math.min(.05,dt||0));
      for(const entry of moving){
        if(entry.kind==='wheel')entry.object.rotation.x+=step*.12;
        else entry.object.rotation.y+=step*.045;
      }
    },
    dispose(){
      group.traverse(o=>{if(o.isMesh && !Object.values(geometry).includes(o.geometry))o.geometry?.dispose();});
      for(const g of Object.values(geometry))g.dispose();
      for(const m of Object.values(mats))m.dispose();
    }
  };
}
