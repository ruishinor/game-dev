// Dense, deterministic, visual-only Lumenfen groundcover.
//
// Contract: every point of the entire region rectangle has a planted or
// dressed cell centre less than 5 metres away, including arrival approaches,
// water, and quality=0. This is a spatial coverage bound, not a claim that
// every cell has a solid, player-blocking object. Existing terrain, portals,
// creature AI, site colliders, and world geometry remain untouched.
import { LUMENFEN, FEN_POOLS, FEN_SITES, FEN_TREES, fenHeight } from '../../shared/lumenfen.js';

const GRID = 6;
const JITTER = 0.26;
const PORTALS = Object.freeze([
  LUMENFEN.arrival, LUMENFEN.returnRift, LUMENFEN.springRift,
  LUMENFEN.crownRift, LUMENFEN.springLanding, LUMENFEN.crownLanding
]);
const TAU = Math.PI * 2;
const fract = x => x - Math.floor(x);
const noise = (a, b, seed = 1) => fract(Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453123);
const distance = (a, x, z) => Math.hypot(a.x - x, a.z - z);
const nearest = (points, x, z) => Math.min(...points.map(p => distance(p, x, z)));

export function planLumenfenGroundcover() {
  const nx = Math.ceil(LUMENFEN.hw * 2 / GRID);
  const nz = Math.ceil(LUMENFEN.hd * 2 / GRID);
  const dx = LUMENFEN.hw * 2 / nx, dz = LUMENFEN.hd * 2 / nz;
  const cells = [];
  for (let row = 0; row < nz; row++) for (let col = 0; col < nx; col++) {
    const x = LUMENFEN.x - LUMENFEN.hw + (col + .5) * dx
      + (noise(col, row, 3) - .5) * 2 * JITTER;
    const z = LUMENFEN.z - LUMENFEN.hd + (row + .5) * dz
      + (noise(col, row, 5) - .5) * 2 * JITTER;
    // A shallow, readable return approach is more important than tall clutter.
    const portal = nearest(PORTALS, x, z) < 12;
    const site = FEN_SITES.find(s => distance(s, x, z) < s.clearance + 2);
    const pool = FEN_POOLS.find(w => {
      const q = ((x - w.x) / (w.rx * .96)) ** 2 + ((z - w.z) / (w.rz * .96)) ** 2;
      return q < 1;
    });
    const tree = FEN_TREES.some(t => distance(t, x, z) < t.r + 1.0);
    const bank = !pool && FEN_POOLS.some(w => {
      const q = ((x - w.x) / (w.rx + 3)) ** 2 + ((z - w.z) / (w.rz + 3)) ** 2;
      return q < 1.20;
    });
    const h = noise(col, row, 9);
    // Portal approaches and occupied site cores get low, unobstructive moss.
    // Water gets floating vegetation instead of trees sprouting from the pond.
    const kind = portal || site || tree ? 'moss'
      : pool ? 'lily' : bank ? (h < .55 ? 'reed' : 'sedge')
      : h < .19 ? 'fungi'
      : h < .44 ? 'fern'
      : h < .72 ? 'sedge'
      : h < .85 ? 'driftwood'
      : 'moss';
    cells.push(Object.freeze({
      x, z, col, row, kind, portal, bank, water: !!pool,
      y: pool ? fenHeight(pool.x, pool.z) + .11 : fenHeight(x, z) + .025,
      rotation: noise(col, row, 17) * TAU,
      scale: .83 + noise(col, row, 19) * .54,
    }));
  }
  // Even a point on a boundary/corner is within this conservative distance
  // of the planted cell centre. No exclusions can silently create holes.
  const worstDistance = Math.hypot(dx / 2 + JITTER, dz / 2 + JITTER);
  return Object.freeze({cells:Object.freeze(cells),cols:nx,rows:nz,
    maxCoverageDistance:worstDistance,spacingX:dx,spacingZ:dz,gridMetres:GRID});
}

function meshGeometry(T, verts, indices, colors) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
  if (colors?.length) g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();
  return g;
}

// A folded leaf surface has a central ridge, tapered outline, and natural
// twist. It is not a cone/low-poly ball and is shared by every instance.
function makeFoliage(T, kind) {
  const v=[],ix=[],col=[];
  const blades = kind === 'fern' ? 12 : kind === 'reed' ? 15 :
    kind === 'sedge' ? 20 : kind === 'moss' ? 15 : kind === 'lily' ? 9 : 8;
  const length = kind === 'reed' ? 1.0 : kind === 'sedge' ? .66 :
    kind === 'moss' ? .20 : kind === 'lily' ? .51 : .72;
  for (let i=0; i<blades; i++) {
    const a = i * 2.399963 + (i%3)*.17;
    const vx = Math.cos(a), vz = Math.sin(a), nx = -vz, nz = vx;
    const len = length * (.72 + (i%5)*.082);
    const base = v.length / 3;
    const segments = kind === 'moss' ? 4 : 7;
    const width = (kind === 'moss' ? .18 : kind === 'lily' ? .19 :
      kind === 'reed' ? .038 : kind === 'sedge' ? .065 : .16) * (i%4===0?1.2:1);
    for (let j=0; j<=segments; j++) {
      const t=j/segments, r=len*t;
      const taper=Math.pow(Math.sin(Math.PI*Math.pow(t,.72)),.8);
      const sweep=.055*Math.sin(t*Math.PI+a);
      const height=kind==='lily' ? .026*Math.sin(Math.PI*t) :
        kind==='moss' ? .07*Math.sin(Math.PI*t) :
        len * (kind==='reed' ? .9 : kind==='sedge' ? .74 : .35) * Math.sin(t*Math.PI*.7);
      const x=vx*r+nx*sweep,z=vz*r+nz*sweep;
      for (const [side, ybend] of [[-1,-.024],[0,.032],[1,-.024]]) {
        v.push(x + nx*side*width*taper,
          height + ybend*Math.sin(Math.PI*t),z + nz*side*width*taper);
        const brightness=.68+.22*(i%5)/4+(side===0?.12:0);
        col.push(brightness*.80,brightness,brightness*.81);
      }
    }
    for (let j=0;j<segments;j++){
      const b=base+j*3,n=b+3;
      ix.push(b,n,b+1,b+1,n,n+1,b+1,n+1,b+2,b+2,n+1,n+2);
    }
  }
  return meshGeometry(T,v,ix,col);
}

// Fungal brackets with a scalloped, layered profile rather than spheres.
function makeFungi(T) {
  const v=[],ix=[],col=[];
  for(let cap=0;cap<6;cap++){
    const a=cap*TAU/6,base=v.length/3;
    const cx=Math.cos(a)*.24,cz=Math.sin(a)*.24;
    for(let ring=0;ring<=4;ring++)for(let k=0;k<=12;k++){
      const t=ring/4,theta=(k/12-.5)*1.8+a,r=.05+.40*t;
      const ripple=1+.07*Math.sin(k*2.7+cap);
      v.push(cx+Math.cos(theta)*r*ripple,.05+cap*.045+
        (1-t)*.23+.035*Math.sin(k*.6)*t,cz+Math.sin(theta)*r*ripple);
      const shade=.58+.18*Math.cos(t*2.1)+.04*(cap%3);
      col.push(shade*.95,shade,shade*.73);
    }
    for(let ring=0;ring<4;ring++)for(let k=0;k<12;k++){
      const b=base+ring*13+k,n=b+13;ix.push(b,n,b+1,b+1,n,n+1);
    }
  }
  return meshGeometry(T,v,ix,col);
}

// Wind-tumbled wood: bent, tapering lengths with ridged bark. Entire cluster
// shares one instanced mesh and one material.
function makeDriftwood(T) {
  const v=[],ix=[],col=[],sides=9,sections=9;
  for(let limb=0;limb<4;limb++){
    const a=limb*2.39,base=v.length/3;
    for(let j=0;j<=sections;j++)for(let k=0;k<sides;k++){
      const t=j/sections,ang=k*TAU/sides;
      const length=.45+.15*(limb%3);
      const px=Math.cos(a)*length*(t-.5),pz=Math.sin(a)*length*(t-.5);
      const radius=.07*(1-t*.7)*(1+.12*Math.sin(ang*5+t*7));
      v.push(px+Math.sin(a)*radius*Math.cos(ang),
        .095+.04*Math.sin(t*7+limb)+radius*Math.sin(ang),
        pz-Math.cos(a)*radius*Math.cos(ang));
      col.push(.75+.05*(limb%3),.82,.75);
    }
    for(let j=0;j<sections;j++)for(let k=0;k<sides;k++){
      const b=base+j*sides+k,n=base+j*sides+(k+1)%sides;
      ix.push(b,n,b+sides,n,n+sides,b+sides);
    }
  }
  return meshGeometry(T,v,ix,col);
}

export const LUMENFEN_COVER_TYPES=Object.freeze(['fern','sedge','reed','moss','lily','fungi','driftwood']);

export function buildLumenfenGroundcover(T, parent, {detail=1}={}) {
  const plan=planLumenfenGroundcover();
  const root=new T.Group();root.name='lumenfen:continuous-groundcover';parent.add(root);
  const geom={
    fern:makeFoliage(T,'fern'),sedge:makeFoliage(T,'sedge'),
    reed:makeFoliage(T,'reed'),moss:makeFoliage(T,'moss'),
    lily:makeFoliage(T,'lily'),fungi:makeFungi(T),driftwood:makeDriftwood(T)
  };
  const mat=Object.fromEntries(LUMENFEN_COVER_TYPES.map(kind=>[kind,new T.MeshStandardMaterial({
    color:({fern:0x477453,sedge:0x7b9b6c,reed:0x74886a,moss:0x526f51,
      lily:0x76a88b,fungi:0xb1a77b,driftwood:0x6b5e4e})[kind],
    vertexColors:true,roughness:kind==='lily'?.4:kind==='driftwood'?.96:.82,
    metalness:0,side:T.DoubleSide,depthWrite:true
  })]));
  const groups=new Map(), counts=Object.fromEntries(LUMENFEN_COVER_TYPES.map(k=>[k,0]));
  // Independent smaller satellites break up the lattice's visual rhythm.
  // Only anchor cells carry the coverage proof, so reducing quality drops
  // these extras without ever changing the guaranteed six-metre distribution.
  const placements=[...plan.cells];
  if(detail>=.5)for(const cell of plan.cells){
    if(cell.portal)continue;
    const h=noise(cell.col,cell.row,23);
    const extras=h<.25?0:h<.73?1:2;
    for(let i=0;i<extras;i++){
      const angle=cell.rotation+i*2.399+noise(cell.col,cell.row,27)*TAU;
      const rad=1.05+noise(cell.col+i,cell.row,29)*1.15;
      const x=cell.x+Math.cos(angle)*rad,z=cell.z+Math.sin(angle)*rad;
      if(Math.abs(x-LUMENFEN.x)>LUMENFEN.hw||
        Math.abs(z-LUMENFEN.z)>LUMENFEN.hd||nearest(PORTALS,x,z)<12)continue;
      const kind=cell.water?'lily':
        noise(cell.col+i,cell.row,31)>.80?'moss':cell.kind;
      placements.push({...cell,x,z,kind,portal:false,
        y:cell.water?cell.y:fenHeight(x,z)+.025,
        rotation:angle,scale:.43+noise(cell.col+i,cell.row,37)*.45});
    }
  }
  // 48-metre chunks: only a few instanced draw calls are visible near camera.
  const cellsPerChunk=8;
  for(const cell of placements){
    const key=Math.floor(cell.col/cellsPerChunk)+':'+Math.floor(cell.row/cellsPerChunk)+':'+cell.kind;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(cell);counts[cell.kind]++;
  }
  const p=new T.Vector3(),s=new T.Vector3(),q=new T.Quaternion(),rot=new T.Euler();
  const matrix=new T.Matrix4(),meshList=[];
  for(const [key,cells] of groups){
    const kind=cells[0].kind;
    const mesh=new T.InstancedMesh(geom[kind],mat[kind],cells.length);
    mesh.name='lumenfen:groundcover:'+key;
    mesh.castShadow=false;mesh.receiveShadow=kind!=='lily';
    cells.forEach((c,i)=>{
      p.set(c.x,c.y,c.z);
      rot.set(0,c.rotation,0);q.setFromEuler(rot);
      // "detail" is an optional complexity preference, never a gap-making
      // density switch. Quality 0 still preserves complete six-metre coverage.
      const size = c.kind==='moss'&&c.portal ? .46 : c.scale*(detail<.5?.82:1);
      s.set(size,size,size);
      matrix.compose(p,q,s);mesh.setMatrixAt(i,matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
    root.add(mesh);meshList.push(mesh);
  }
  return {
    group:root,
    stats:()=>({count:placements.length,anchors:plan.cells.length,
      satellites:placements.length-plan.cells.length,counts:{...counts},
      maxCoverageDistance:plan.maxCoverageDistance,gridMetres:plan.gridMetres,
      drawBatches:meshList.length,chunks:groups.size}),
    dispose(){
      root.removeFromParent();
      for(const mesh of meshList)mesh.dispose?.();
      for(const geo of Object.values(geom))geo.dispose();
      for(const m of Object.values(mat))m.dispose();
    }
  };
}
