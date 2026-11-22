// Heightfield-following hostile warning footprint. Presentation-only.
// The boundary and colored area sample terrain at multiple concentric radii
// rather than disappearing beneath slopes when centre-height != edge-height.
export const TELEGRAPH_TERRAIN_BUDGET=Object.freeze({segments:48,rings:8,geometries:2});
export function buildTerrainTelegraphGeometry(T,x,z,radius,groundHeight) {
 if(![x,z,radius].every(Number.isFinite)||radius<=.05||radius>80||typeof groundHeight!=='function')
  throw Error('Invalid telegraph centre or radius');
 const base=groundHeight(x,z);
 if(!Number.isFinite(base))throw Error('Invalid ground at telegraph centre');
 const create=(inner,outer,rings,raise)=>{
  const geo=new T.RingGeometry(inner*radius,outer*radius,TELEGRAPH_TERRAIN_BUDGET.segments,rings);
  geo.rotateX(-Math.PI/2);
  const p=geo.attributes.position;
  for(let i=0;i<p.count;i++){
   const gx=x+p.getX(i),gz=z+p.getZ(i),h=groundHeight(gx,gz);
   p.setY(i,(Number.isFinite(h)?h:base)-base+raise);
  }
  p.needsUpdate=true;geo.computeVertexNormals();return geo;
 };
 return {edge:create(.86,1,2,.14),disc:create(0,.86,TELEGRAPH_TERRAIN_BUDGET.rings,.12),base};
}
