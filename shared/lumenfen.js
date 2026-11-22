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
export const FEN_POOLS=Object.freeze([
  [-74,-51,31,18],[-25,39,25,20],[65,-44,30,23],
  [46,98,20,15],[-82,93,26,18],[7,-88,23,17],
].map(([u,v,rx,rz],i)=>Object.freeze({x:P.x+u,z:P.z+v,rx,rz,seed:110+i})));
const access=[P.arrival,P.returnRift,P.springRift,P.crownRift,P.springLanding,P.crownLanding];
const square=(n)=>n*n;
function clear(x,z,r){return access.every(p=>Math.hypot(x-p.x,z-p.z)>r+12);}
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
export const FEN_COLLIDERS=FEN_TREES;
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
export function fenArea(x,z){
  const u=x-P.x,v=z-P.z;
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
