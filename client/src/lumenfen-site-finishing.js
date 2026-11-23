// Visual-only site finishing. Kept separate from site hydrology construction so
// the waterworks/portal geometry and the active hydrology PR remain independent.
import { fenFoliageGeometry, fenStemGeometry, fenSurfaceDetail } from './lumenfen-organics.js';

function weatheredStone(T) {
  const g = new T.IcosahedronGeometry(1, 3);
  const p = g.getAttribute('position');
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    // Nonuniform sedimentary edges, not a smooth sphere or faceted playdough.
    const ripple = .94 + .045*Math.sin(11*x+4*z)*Math.cos(7*y-3*x)
      + .027*Math.sin(23*z+17*y);
    p.setXYZ(i, x*ripple, y*(.93+.065*Math.sin(8*x)), z*ripple);
  }
  p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();
  return g;
}
function agedPlank(T) {
  // Modest bevels catch sunlight, emphasizing real board edges rather than
  // a collection of unlit cuboids. Instancing keeps the site draw calls fixed.
  const s = new T.Shape();
  s.moveTo(-.47,-.49);s.lineTo(.47,-.49);s.lineTo(.5,-.46);
  s.lineTo(.5,.46);s.lineTo(.47,.49);s.lineTo(-.47,.49);
  s.lineTo(-.5,.46);s.lineTo(-.5,-.46);s.closePath();
  const g = new T.ExtrudeGeometry(s, {
    depth: .94, steps: 1, bevelEnabled: true, bevelThickness: .027,
    bevelSize: .021, bevelSegments: 2, curveSegments: 1
  });
  g.translate(0,0,-.47);g.computeVertexNormals();return g;
}

export function finishLumenfenSites(T, sites) {
  if(!sites) return { replaced: 0, detailedMaterials: 0 };
  let replaced=0, detailedMaterials=0;
  const processed = new Set();
  sites.traverse(o => {
    if(!o.isInstancedMesh || !o.name.startsWith('lumenfen:detail:')) return;
    const key=o.name.slice(o.name.lastIndexOf(':')+1);
    const [shape,material]=key.split('|');
    let g=null;
    if(shape==='stone') g=weatheredStone(T);
    if(shape==='leaf') g=fenFoliageGeometry(T,'cage');
    if(shape==='column' && (material==='wood'||material==='pale')) g=fenStemGeometry(T);
    if(shape==='box' && (material==='wood'||material==='pale')) g=agedPlank(T);
    if(g){
      // Old shared template is still owned/disposed by buildLumenfenSites.
      // The replacement is owned/disposed by its returned group's traversal.
      o.geometry=g;
      o.computeBoundingSphere();
      replaced++;
    }
    if(!processed.has(o.material) && ['wood','pale','stone','moss'].includes(material)){
      fenSurfaceDetail(o.material,material==='stone'?'stone':'bark');
      processed.add(o.material);
      detailedMaterials++;
    }
  });
  return { replaced, detailedMaterials };
}
