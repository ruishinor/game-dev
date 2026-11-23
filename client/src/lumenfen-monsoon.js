// Localized monsoon bloom and rain. All gameplay weather is server-owned;
// presentation uses the existing pooled VFX engine, not separate emitters.
// Seasonal plant clusters are visual-only: no new hidden movement colliders.
import {FEN_POOLS,FEN_SITES,LUMENFEN,fenHeight,inLumenfen} from '../../shared/lumenfen.js';
import {CELL} from './vfx/textures.js';

const TAU=Math.PI*2;
const noise=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
const nearPortal=(x,z)=>[LUMENFEN.arrival,LUMENFEN.returnRift,
  LUMENFEN.springRift,LUMENFEN.crownRift,
  LUMENFEN.springLanding,LUMENFEN.crownLanding]
  .some(p=>Math.hypot(x-p.x,z-p.z)<12);
function flowerGeometry(T){
  const pos=[],index=[],color=[];
  for(let petal=0;petal<8;petal++){
    const a=petal*TAU/8;
    const f=Math.cos(a),g=Math.sin(a),base=pos.length/3;
    const sideX=-g,sideZ=f;
    for(let seg=0;seg<=7;seg++){
      const t=seg/7,width=.24*Math.sin(Math.PI*t)**.76;
      const r=.13+t*.72;
      const y=t*.59+.075*Math.sin(Math.PI*t*2);
      for(const side of [-1,0,1]){
        pos.push(f*r+sideX*width*side,y+(side===0?.058:0),g*r+sideZ*width*side);
        color.push(.68+(side===0?.19:0),.8,.75+(petal%3)*.05);
      }
    }
    for(let j=0;j<7;j++){
      const b=base+j*3,n=b+3;
      index.push(b,n,b+1,b+1,n,n+1,b+1,n+1,b+2,b+2,n+1,n+2);
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new T.Float32BufferAttribute(color,3));
  geo.setIndex(index);geo.computeVertexNormals();return geo;
}
export function buildFenMonsoonBloom(T,group){
 const root=new T.Group();root.name='lumenfen:monsoon-bloom';group.add(root);
 const placements=[];
 // Flood-edge blooms gather in clumps beside pools and old masonry.
 for(let i=0;i<450;i++){
   const w=FEN_POOLS[i%FEN_POOLS.length];
   const a=i*2.39996+noise(i,3)*.2;
   const r=1.05+noise(i,7)*.34;
   const x=w.x+Math.cos(a)*w.rx*r,z=w.z+Math.sin(a)*w.rz*r;
   if(!inLumenfen(x,z)||nearPortal(x,z))continue;
   if(FEN_SITES.some(s=>Math.hypot(x-s.x,z-s.z)<s.clearance+1))continue;
   placements.push({x,z,angle:a,scale:.57+noise(i,11)*.67});
 }
 const geometry=flowerGeometry(T);
 const material=new T.MeshPhysicalMaterial({color:0x75bba3,vertexColors:true,
   metalness:.03,roughness:.45,clearcoat:.6,clearcoatRoughness:.2,
   emissive:0x1e574b,emissiveIntensity:.29,side:T.DoubleSide});
 const flowers=new T.InstancedMesh(geometry,material,placements.length);
 flowers.name='lumenfen:monsoon:glassflower';flowers.receiveShadow=true;flowers.castShadow=false;
 const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3(),m=new T.Matrix4();
 for(let i=0;i<placements.length;i++){
   const v=placements[i],height=fenHeight(v.x,v.z);
   p.set(v.x,height+.06,v.z);q.setFromEuler(new T.Euler(0,v.angle,0));
   s.set(v.scale,v.scale,v.scale);m.compose(p,q,s);flowers.setMatrixAt(i,m);
 }
 flowers.instanceMatrix.needsUpdate=true;flowers.computeBoundingSphere();
 root.add(flowers);root.visible=false;
 let intensity=0;
 return {
   group:root,
   update(climate){
     intensity=Number.isFinite(climate?.rain)?Math.max(0,Math.min(1,climate.rain)):0;
     root.visible=intensity>=.27;
     material.emissiveIntensity=.22+intensity*.30;
     material.roughness=.53-intensity*.18;
   },
   stats:()=>({plants:placements.length,visible:root.visible,intensity}),
   dispose(){root.removeFromParent();flowers.dispose?.();geometry.dispose();material.dispose();}
 };
}

export function createFenMonsoonFx(vfx){
 let accumulator=0,bursts=0;
 let disposed=false;
 return {
  update(dt,eye,climate,reducedMotion=false){
   if(disposed||!vfx||vfx.quality<=0||!eye||!inLumenfen(eye.x,eye.z,22))return;
   const rain=climate?.rain||0;
   if(rain<.2){accumulator=0;return;}
   if(!Number.isFinite(dt)||dt<=0)return;
   accumulator+=Math.min(.12,dt);
   const interval=reducedMotion?.35:.17;
   if(accumulator<interval)return;
   accumulator%=interval;
   const x=eye.x,z=eye.z;
   const rainCount=Math.min(30,Math.max(5,Math.round(rain*(reducedMotion?7:23))));
   // Pooled local shafts, not a separate rain system with thousands of meshes.
   vfx.burst({
     at:[x,fenHeight(x,z)+8.3,z],shape:'disc',radius:11,
     count:rainCount,blend:'alpha',cell:CELL.streak,
     color:0x9bbab6,color2:0xc1d4d1,alpha:.40,
     size:[.012,.022],sizeEnd:.007,stretch:.09,
     dir:[climate.wind*.24,-1,.1],spread:.13,
     speed:[13,19],life:[.46,.76],gravity:0,drag:0,
   });
   // Ripples and wet spray wherever nearby water actually exists.
   if(bursts%2===0){
     const pool=FEN_POOLS.find(w=>Math.hypot(w.x-x,w.z-z)<w.rx+13);
     if(pool){
       const a=bursts*2.39996,r=.25+.5*noise(bursts,9);
       const px=pool.x+Math.cos(a)*pool.rx*r,pz=pool.z+Math.sin(a)*pool.rz*r;
       vfx.burst({
         at:[px,fenHeight(pool.x,pool.z)+.13,pz],shape:'ring',radius:.10,
         count:Math.max(3,Math.round(6*rain)),blend:'alpha',
         cell:[CELL.bubble,CELL.streak],color:0x9bd4ca,
         alpha:.38,size:[.01,.025],sizeEnd:.006,
         dir:[0,1,0],up:.15,radial:true,speed:[.1,.3],life:[.35,.65],
       });
     }
   }
   bursts++;
  },
  stats:()=>({bursts,disposed}),
  dispose(){disposed=true;}
 };
}


// Six reversible floodplain sheets: water spreads into root and reed beds
// without moving the authoritative terrain or introducing phantom colliders.
// Each ring follows the actual deterministic bank height.
export function buildFenMonsoonFlood(T,group){
 const root=new T.Group();root.name='lumenfen:monsoon-floodplain';
 root.visible=false;group.add(root);
 const material=new T.MeshPhysicalMaterial({
   color:0x3e8587,metalness:.11,roughness:.22,clearcoat:.72,
   clearcoatRoughness:.12,transparent:true,opacity:.0,depthWrite:false,
   side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,
 });
 const strips=[];
 for(const pool of FEN_POOLS){
   const vertices=[],indices=[],N=96,rings=[1.005,1.09,1.18,1.29];
   for(const rad of rings)for(let i=0;i<N;i++){
     const a=i*TAU/N;
     const wave=1+.029*Math.sin(a*7+pool.seed)+.017*Math.sin(a*13-pool.seed*.19);
     const x=pool.x+Math.cos(a)*pool.rx*rad*wave;
     const z=pool.z+Math.sin(a)*pool.rz*rad*wave;
     vertices.push(x,fenHeight(x,z)+.045,z);
   }
   for(let j=0;j<rings.length-1;j++)for(let i=0;i<N;i++){
     const a=j*N+i,b=j*N+(i+1)%N,c=(j+1)*N+i,d=(j+1)*N+(i+1)%N;
     indices.push(a,c,b,b,c,d);
   }
   const geo=new T.BufferGeometry();
   geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
   geo.setIndex(indices);geo.computeVertexNormals();
   const mesh=new T.Mesh(geo,material);
   mesh.name='lumenfen:monsoon:bank-flood';mesh.receiveShadow=true;
   root.add(mesh);strips.push(mesh);
 }
 let flood=0;
 return {
  group:root,
  update(state){
   flood=Number.isFinite(state?.flood)?Math.max(0,Math.min(1,state.flood)):0;
   root.visible=flood>.15;
   material.opacity=.08+flood*.30;
   material.roughness=.15+(state?.wind||0)*.23;
  },
  stats:()=>({flood,bankSheets:strips.length,visible:root.visible}),
  dispose(){
    root.removeFromParent();
    for(const mesh of strips)mesh.geometry.dispose();
    material.dispose();strips.length=0;
  }
 };
}
