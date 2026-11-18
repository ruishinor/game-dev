// Presentation-only Sinter habitat: two terrain-conforming, continuously
// folded biological mats at the existing authoritative ecological sites.
// No new collision, harvest nodes, ecology state, rewards or emissive cues.
import { SINTER_SITES, groundHeight, mulberry32 } from '../../shared/world.js';

const TAU=Math.PI*2;

function surface(T,site,name){
  const xyz=[],rgb=[],indices=[];
  const C=new T.Color();
  const group=new T.Group();group.name=name;group.position.set(site.x,0,site.z);
  function vertex(x,z,h,a,b,t,shade=1){
    const id=xyz.length/3;
    xyz.push(x,groundHeight(site.x+x,site.z+z)+h,z);
    C.setHex(a).lerp(new T.Color(b),Math.max(0,Math.min(1,t))).multiplyScalar(shade);
    rgb.push(C.r,C.g,C.b);
    return id;
  }
  const tri=(a,b,c)=>indices.push(a,b,c);
  // Radial loft with one centre and a closed irregular perimeter. All heights
  // are relative to the actual ground, even on the edge of a sloping site.
  function patch({x=0,z=0,rx,rz,height,angle=0,phase=0,a,b,veins=8,fold=.13}){
    const rotX=Math.cos(angle),rotZ=Math.sin(angle),N=40,R=7;
    const center=vertex(x,z,height,a,b,.65);
    const start=xyz.length/3;
    for(let j=1;j<=R;j++){
      const t=j/R;
      for(let i=0;i<N;i++){
        const theta=TAU*i/N;
        const edge=1+fold*Math.cos(5*theta+phase)+.055*Math.sin(9*theta-phase);
        const u=Math.cos(theta)*rx*t*edge,w=Math.sin(theta)*rz*t*edge;
        const rib=Math.cos(veins*theta+3.4*t+phase);
        const crest=Math.pow(Math.max(0,1-t*t),1.28);
        const h=-.018+(height+.018)*crest*(1+.12*rib*t);
        const color=.22+.55*crest+.16*Math.sin(theta*3+phase)*t;
        // Pigment runs along the radial rib, with a dark inner capillary.
        const shade=.78+.20*(.5+.5*rib)-.14*Math.pow(.5+.5*rib,10)*t;
        vertex(x+u*rotX-w*rotZ,z+u*rotZ+w*rotX,h,a,b,color,shade);
      }
    }
    for(let i=0;i<N;i++)tri(center,start+(i+1)%N,start+i);
    for(let j=0;j<R-1;j++)for(let i=0;i<N;i++){
      const k=(i+1)%N,inner=start+j*N,outer=inner+N;
      tri(inner+i,inner+k,outer+k);tri(inner+i,outer+k,outer+i);
    }
  }
  // Continuous crescent-shaped shelter; corrugated ribs rather than a ring
  // of disconnected stones. Ends taper into the surrounding substrate.
  function crescent(){
    const A=64,B=12,start=xyz.length/3;
    for(let i=0;i<=A;i++){
      const u=i/A,theta=5.0+4.5*u,end=Math.pow(Math.sin(Math.PI*u),.48);
      for(let j=0;j<=B;j++){
        const v=j/B,fold=Math.sin(Math.PI*v);
        const center=1.12+.08*Math.sin(6*theta)+.035*Math.sin(13*theta);
        const width=(.10+.42*end)*(1+.10*Math.sin(9*theta));
        const r=center+(v-.5)*width;
        const h=-.018+.265*end*Math.pow(fold,.68)*(.88+.09*Math.sin(19*theta+v*8)+.04*Math.sin(36*theta));
        const band=.26+.50*fold+.14*Math.sin(18*theta+v*5)*fold;
        vertex(Math.cos(theta)*r,Math.sin(theta)*r*.84,h,0x535742,0xaaa283,band,.84+.16*Math.cos(v*Math.PI*4));
      }
    }
    for(let i=0;i<A;i++)for(let j=0;j<B;j++){
      const a=start+i*(B+1)+j,b=a+B+1;
      tri(a,b,b+1);tri(a,b+1,a+1);
    }
  }
  function finish(){
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(xyz,3));
    geo.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
    geo.setIndex(indices);geo.computeVertexNormals();geo.computeBoundingSphere();
    const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.84,metalness:.035});
    const mesh=new T.Mesh(geo,material);mesh.name=name+':membrane';mesh.receiveShadow=true;
    group.add(mesh);return group;
  }
  return {patch,crescent,finish};
}

export function buildSinterHabitat(T){
  const root=new T.Group();root.name='sinter:habitats';
  const nest=surface(T,SINTER_SITES.nursery,'sinter:nursery');
  const bed=surface(T,SINTER_SITES.mineral,'sinter:mineral-bed');
  const rnd=mulberry32(17118);
  nest.patch({rx:.88,rz:.64,height:.055,a:0x4b5141,b:0x88876a,phase:.8,fold:.07});
  nest.crescent();
  for(let i=0;i<5;i++){
    const a=TAU*i/5+.35,rx=.16+rnd()*.06;
    nest.patch({x:.38*Math.cos(a),z:.30*Math.sin(a),rx,rz:rx*.72,height:.115+rnd()*.025,
      angle:a,phase:a,a:0x54664c,b:0x929a73,veins:6,fold:.06});
  }
  // Fine root fans at the outer margin; no spike or harvestable landmark.
  for(let i=0;i<9;i++){
    const a=5.15+i*.47;
    nest.patch({x:1.30*Math.cos(a),z:1.09*Math.sin(a),rx:.32+rnd()*.16,rz:.055+rnd()*.04,height:.047,
      angle:a,phase:a,a:0x55583f,b:0x9b916c,veins:5,fold:.08});
  }
  bed.patch({rx:1.62,rz:1.27,height:.095,a:0x575a48,b:0xa89f7b,phase:1.4,fold:.16});
  for(let i=0;i<13;i++){
    const a=i*2.399963,rad=.27+.94*Math.sqrt(i/12);
    const rx=.18+rnd()*.23;
    bed.patch({x:Math.cos(a)*rad,z:Math.sin(a)*rad*.80,rx,rz:rx*(.64+rnd()*.25),height:.13+rnd()*.09,
      angle:a+.4,phase:rnd()*TAU,a:0x68664e,b:i%3===0?0xc0b18b:0xa59c80,veins:8+i%3,fold:.16});
  }
  for(let i=0;i<10;i++){
    const a=TAU*i/10+.17;
    bed.patch({x:1.38*Math.cos(a),z:1.12*Math.sin(a),rx:.35+rnd()*.14,rz:.065+rnd()*.06,height:.046,
      angle:a,phase:a,a:0x535944,b:0x9e9774,veins:5,fold:.06});
  }
  root.add(nest.finish(),bed.finish());return root;
}
