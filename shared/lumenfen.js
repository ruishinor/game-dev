// Lumenfen: a second independent outdoor region. Only geography, known entrances
// and deterministic collision data belong here; encounters/travel are server-owned.
export const LUMENFEN = Object.freeze({
  name: 'Lumenfen', x: 540, z: -720, hw: 145, hd: 165, rim: 11,
  arrival: Object.freeze({ x: 534, z: -852 }),
  returnRift: Object.freeze({ x: 522, z: -852 }),
  springRift: Object.freeze({ x: 621, z: -660 }),
  crownRift: Object.freeze({ x: 458, z: -688 }),
  springLanding: Object.freeze({ x: 614, z: -660 }),
  crownLanding: Object.freeze({ x: 466, z: -688 }),
});
const P=LUMENFEN;
// Environmental landmark cores remain outside all portal and arrival approach
// circles. Tree scatter must respect their physical footprints; only the
// central built/solid mass is a player collider, not walkable piers/decking.
export const FEN_SITES=Object.freeze([
  ['veil-landing',18,-130,7],
  ['mossbound-thicket',-80,-8,9],
  ['glasswater-spring',106,61,10],
  ['root-crown-hollow',-108,34,10],
  ['tidal-weir',40,10,12],
  ['luminous-canopy',26,114,10],
].map(([id,u,v,clearance])=>Object.freeze({
  id,x:P.x+u,z:P.z+v,clearance
})));
export const FEN_POOLS=Object.freeze([
  [-74,-51,31,18],[-25,39,25,20],[65,-44,30,23],
  [46,98,20,15],[-82,93,26,18],[7,-88,23,17],
].map(([u,v,rx,rz],i)=>Object.freeze({x:P.x+u,z:P.z+v,rx,rz,seed:110+i})));
const access=[P.arrival,P.returnRift,P.springRift,P.crownRift,P.springLanding,P.crownLanding];
const square=(n)=>n*n;
function clear(x,z,r){
  return access.every(p=>Math.hypot(x-p.x,z-p.z)>r+12)
    && FEN_SITES.every(s=>Math.hypot(x-s.x,z-s.z)>r+s.clearance+2);
}
function makeTrees(){
  const trees=[];
  // A different spatial rhythm from the Expanse's rock/mesa scatter.
  // Closed-canopy islands form around the water; both rift paths remain open.
  for(let row=0;row<10;row++)for(let col=0;col<9;col++){
    const seed=row*31+col*57+17;
    const u=-125+col*31+Math.sin(seed*.73)*7;
    const v=-138+row*31+Math.cos(seed*.39)*6;
    const x=P.x+u,z=P.z+v,r=1.45+(seed%6)*.24;
    if(!clear(x,z,r))continue;
    if(FEN_POOLS.some(w=>square((x-w.x)/(w.rx+5))+square((z-w.z)/(w.rz+5))<1))continue;
    trees.push(Object.freeze({type:'fen_tree',x,z,r,h:12+(seed%8)*2.3,seed}));
  }
  return Object.freeze(trees);
}
export const FEN_TREES=makeTrees();
// Match only actual solid piers, trunks, stones and machinery: whole-site
// radius blockers would make an otherwise traversable observatory or deck
// inaccessible. All geometry here is in site-local horizontal coordinates.
export const FEN_SITE_COLLIDERS=Object.freeze(FEN_SITES.flatMap(s=>{
  const circle=(dx,dz,r)=>({type:'fen_site',site:s.id,x:s.x+dx,z:s.z+dz,r});
  const box=(dx,dz,hw,hd)=>({type:'fen_site',site:s.id,x:s.x+dx,z:s.z+dz,hw,hd});
  if(s.id==='veil-landing')
    return Array.from({length:7},(_,i)=>{const a=i*Math.PI*2/7,r=4.4+.4*Math.sin(i*2);return circle(Math.cos(a)*r,Math.sin(a)*r,.9);});
  if(s.id==='mossbound-thicket')
    return Array.from({length:5},(_,i)=>{const a=i*2.399,r=2.7+(i%2)*1.9;return circle(Math.cos(a)*r,Math.sin(a)*r,.75);});
  if(s.id==='glasswater-spring')
    return [circle(7.5,-2.7,1.1),...[-8,-4,0,4,8].flatMap(j=>[-1.65,1.65].map(z=>circle(j*.78,z,.22)))];
  if(s.id==='root-crown-hollow')
    return Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return circle(Math.cos(a)*5.4,Math.sin(a)*5.4,.7);});
  if(s.id==='tidal-weir')
    return [box(-6.4,0,.85,4.1),box(6.4,0,.85,4.1),box(0,0,4.5,2.9),circle(8,0,2.2)];
  if(s.id==='luminous-canopy')
    return Array.from({length:7},(_,i)=>{const a=i*2.399,r=2.7+(i%3)*1.4;return circle(Math.cos(a)*r,Math.sin(a)*r,.66);});
  return [];
}).map(c=>Object.freeze(c)));
export const FEN_COLLIDERS=Object.freeze([...FEN_TREES,...FEN_SITE_COLLIDERS]);
export function inLumenfen(x,z,pad=0){
  return Math.abs(x-P.x)<=P.hw+pad && Math.abs(z-P.z)<=P.hd+pad;
}
export function clampToLumenfen(p,rad){
  const dx=P.hw-P.rim-rad,dz=P.hd-P.rim-rad;
  p.x=Math.max(P.x-dx,Math.min(P.x+dx,p.x));
  p.z=Math.max(P.z-dz,Math.min(P.z+dz,p.z));
  return p;
}
const smooth=t=>{const x=Math.min(1,Math.max(0,t));return x*x*(3-2*x);};
export function fenHeight(x,z){
  const u=x-P.x,v=z-P.z;
  let h=.25*Math.sin(u*.075+v*.026)+.22*Math.cos(v*.065-u*.017)+.12*Math.sin(u*.19+v*.22);
  for(const w of FEN_POOLS){
    const d=square((x-w.x)/w.rx)+square((z-w.z)/w.rz);
    if(d<1.5)h-=.62*(1-smooth((d-.4)/1.1));
  }
  // Level entry terraces and threshold landings; traversable ground never
  // contains separate, hidden vertical platforms.
  for(const p of access)h*=smooth((Math.hypot(x-p.x,z-p.z)-4.5)/10);
  const edge=Math.min(P.hw-Math.abs(u),P.hd-Math.abs(v));
  if(edge<20)h+=square(Math.max(0,20-edge))*.026;
  return h;
}
// Physical landmark positions take precedence over broad regional quadrants.
 // A location label must describe the built place the player is standing in.
const FEN_SITE_NAMES=Object.freeze({
  'veil-landing':'Veil Landing',
  'mossbound-thicket':'Mossbound Thicket',
  'glasswater-spring':'Glasswater Spring',
  'root-crown-hollow':'Root-Crown Hollow',
  'tidal-weir':'Tidal Mycelium',
  'luminous-canopy':'Luminous Canopy',
});
export function fenArea(x,z){
  const u=x-P.x,v=z-P.z;
  for(const site of FEN_SITES){
    if(Math.hypot(x-site.x,z-site.z)<site.clearance+8)
      return FEN_SITE_NAMES[site.id];
  }
  if(Math.hypot(x-P.arrival.x,z-P.arrival.z)<19)return 'Veil Landing';
  if(Math.hypot(x-P.springRift.x,z-P.springRift.z)<21)return 'Glasswater Spring';
  if(Math.hypot(x-P.crownRift.x,z-P.crownRift.z)<22)return 'Root-Crown Hollow';
  if(v>45)return 'Luminous Canopy';
  if(FEN_POOLS.some(w=>square((x-w.x)/w.rx)+square((z-w.z)/w.rz)<1.6))return 'The Mirrorpools';
  if(u<0)return 'Mossbound Thicket';
  return 'Tidal Mycelium';
}
export const FEN_RIFTS=Object.freeze([
 Object.freeze({key:'lumenfen_return',type:'lumenfen_return',name:'Veil Return',...P.returnRift,r:2.45,yaw:Math.PI}),
 Object.freeze({key:'lumenfen_spring',type:'lumenfen_spring',name:'Glasswater Crossing',...P.springRift,r:2.45,yaw:-Math.PI/2}),
 Object.freeze({key:'lumenfen_crown',type:'lumenfen_crown',name:'Root-Crown Crossing',...P.crownRift,r:2.45,yaw:Math.PI/2}),
]);
