// Dependency-free deterministic mesh compiler for original Attunement static assets.
// Coordinates: metres, +Y up, +Z forward. Local origin chosen by each recipe.
// Each model is batched by semantic material. Articulation is explicitly separate.
const V = (a,b) => a.map((x,i)=>x+b[i]);
const S = (a,b) => a.map((x,i)=>x-b[i]);
const M = (a,k) => a.map(x=>x*k);
const D = (a,b) => a.reduce((s,x,i)=>s+x*b[i],0);
const X = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const U = a => {const l=Math.hypot(...a);if(l<1e-10)throw Error('zero direction');return M(a,1/l);};
const F = a=>a.map(Math.fround);
const TAU=Math.PI*2;
const linear=x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;};
const rgb=h=>[16,8,0].map(s=>linear((h>>s)&255));
const mat=(color,metallicFactor,roughnessFactor,emissive)=>({pbrMetallicRoughness:{baseColorFactor:[...rgb(color),1],metallicFactor,roughnessFactor},...(emissive?{emissiveFactor:rgb(emissive)}:{})});
const MATERIALS={
 frame:mat(0x30383b,.72,.54), ceramic:mat(0xbab9a8,.30,.68), steel:mat(0x6e7b7e,.8,.38),
 fabric:mat(0x454442,.02,.94), ochre:mat(0xaa7d35,.25,.62), black:mat(0x1c2529,.14,.78),
 copper:mat(0x94684b,.78,.44), red:mat(0x824943,.15,.8), screen:mat(0x1c454d,.12,.4,0x287e8b),
 amber:mat(0xf4ac50,.12,.39,0xf4ac50), cyan:mat(0x74d2dc,.12,.38,0x69c9da),
 green:mat(0x86cda5,.06,.46,0x399769), violet:mat(0x9d80be,.07,.42,0x6442a0),
 dermal:mat(0x654b59,.02,.78), membrane:mat(0x8c6875,.02,.56),
 crystal:mat(0x99b6cb,.22,.25), crystalDark:mat(0x69769b,.20,.33),
 leaf:mat(0x626e3d,.0,.88), stem:mat(0x594b3d,.0,.87), cap:mat(0x6f5a86,.03,.62),
 mineral:mat(0x92b8ca,.17,.28), mineralDark:mat(0x566b85,.12,.40), biofilm:mat(0x53414b,.0,.62), bioRidge:mat(0x886773,.0,.49), noduleCore:mat(0xb89150,.0,.50,0x68401e), gill:mat(0x9987a2,.0,.84)
};
// Triangle winding is checked against an outward hint for closed convex parts.
// Every face has independent normals/UVs; intentional faceted art style.
function compile(parts) {
 const groups=new Map(); const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];let tris=0;
 function triangle(material,a,b,c,hint,normals=null) {
  a=F(a);b=F(b);c=F(c);let n=X(S(b,a),S(c,a));
  if(Math.hypot(...n)<1e-9)throw Error('degenerate triangle');
  if(hint&&D(n,hint)<0){[b,c]=[c,b];if(normals)normals=[normals[0],normals[2],normals[1]];n=M(n,-1);}
  n=U(n);if(!MATERIALS[material])throw Error('unknown material '+material);
  let g=groups.get(material);if(!g){g={p:[],n:[],uv:[]};groups.set(material,g);}
  for(const [i,p] of [a,b,c].entries()){if(!p.every(Number.isFinite))throw Error('nonfinite');g.p.push(...p);g.n.push(...(normals?U(normals[i]):n));p.forEach((x,i)=>{min[i]=Math.min(min[i],x);max[i]=Math.max(max[i],x);});}
  // Planar world-space UV per face, scaled in metres; intended for tiling materials.
  let axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));let uv=axis===0?[2,1]:axis===1?[0,2]:[0,1];
  for(const p of [a,b,c])g.uv.push(p[uv[0]],p[uv[1]]);
  tris++;
 }
 function convex(p,faces,center,material,normalFor=null){for(const f of faces){for(let i=1;i<f.length-1;i++){const a=p[f[0]],b=p[f[i]],c=p[f[i+1]];triangle(material,a,b,c,S(M(V(V(a,b),c),1/3),center),normalFor?[normalFor(a),normalFor(b),normalFor(c)]:null);}}}
 for(const part of parts){
  const {kind,material}=part;const center=part.center||[0,0,0];
  if(kind==='box'&&part.bevel3d!==undefined){
   // Machined 3-axis chamfer: 6 main faces, 12 edge faces and 8 corner faces.
   const h=part.size.map(x=>x/2),r=part.bevel3d;if(!h.every(x=>x>r)||!(r>0))throw Error('invalid 3d bevel');
   const angle=part.angle??0,ca=Math.cos(angle),sa=Math.sin(angle);
   const xform=([x,y,z])=>V(center,[x*ca-y*sa,x*sa+y*ca,z]);
   const face=(ax,sign,otherSigns)=>{let k=0;return h.map((n,i)=>i===ax?sign*n:otherSigns[k++]*(n-r));};
   const emit=points=>{const p=points.map(xform);for(let i=1;i<p.length-1;i++)triangle(material,p[0],p[i],p[i+1],S(M(V(V(p[0],p[i]),p[i+1]),1/3),center));};
   for(let i=0;i<3;i++)for(const s of [-1,1])emit([[-1,-1],[1,-1],[1,1],[-1,1]].map(o=>face(i,s,o)));
   for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)for(const si of [-1,1])for(const sj of [-1,1]){
    const k=3-i-j,point=(axis,sk)=>h.map((n,l)=>(l===i?si:l===j?sj:sk)*(n-(l===axis?0:r)));
    emit([point(i,-1),point(i,1),point(j,1),point(j,-1)]);
   }
   for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){const ss=[sx,sy,sz];emit([0,1,2].map(ax=>h.map((n,i)=>ss[i]*(n-(i===ax?0:r)))));}
  }else if(kind==='box'){
   const [w,h,d]=part.size.map(x=>x/2);let bevel=part.bevel??Math.min(w,h)*.24;
   if(!(w>0&&h>0&&d>0&&bevel>0&&bevel<Math.min(w,h)))throw Error('invalid box');
   const ring=[[-w+bevel,-h],[w-bevel,-h],[w,-h+bevel],[w,h-bevel],[w-bevel,h],[-w+bevel,h],[-w,h-bevel],[-w,-h+bevel]];
   const angle=part.angle??0;const ca=Math.cos(angle),sa=Math.sin(angle);
   const p=[-d,d].flatMap(z=>ring.map(([x,y])=>V(center,[x*ca-y*sa,x*sa+y*ca,z])));
   const faces=[[0,1,2,3,4,5,6,7],[8,9,10,11,12,13,14,15],...ring.map((_,i)=>[i,(i+1)%8,(i+1)%8+8,i+8])];
   convex(p,faces,center,material);
  }else if(kind==='rod'||kind==='crystal'){
   const {a,b,r}=part;const top=part.r2??r;const sides=part.sides??12;
   if(!(r>0&&top>0&&sides>=3&&sides<=32&&Number.isInteger(sides)))throw Error('invalid rod');
   const w=U(S(b,a));const u=U(X(Math.abs(w[1])>.9?[1,0,0]:[0,1,0],w));const v=X(w,u);
   const rings=[a,b].flatMap((p,j)=>Array.from({length:sides},(_,i)=>{const t=TAU*i/sides;return V(p,M(V(M(u,Math.cos(t)),M(v,Math.sin(t))),j?top:r));}));
   let faces=[Array.from({length:sides},(_,i)=>i),...Array.from({length:sides},(_,i)=>[i,(i+1)%sides,(i+1)%sides+sides,i+sides])];
   if(kind==='crystal'){rings.push(V(b,M(w,part.tip??r*1.8)));for(let i=0;i<sides;i++)faces.push([sides+i,sides+(i+1)%sides,2*sides]);}
   else faces.push(Array.from({length:sides},(_,i)=>i+sides));
   convex(rings,faces,M(V(a,b),.5),material);
  }else if(kind==='orb'){
   const [rx,ry,rz]=part.size;const sides=part.sides??12, rows=part.rows??8;
   if(!part.size.every(x=>x>0)||sides<3||rows<3)throw Error('bad orb');
   const p=[V(center,[0,ry,0])];for(let j=1;j<rows;j++){let t=Math.PI*j/rows;for(let i=0;i<sides;i++){let a=TAU*i/sides;p.push(V(center,[rx*Math.sin(t)*Math.cos(a),ry*Math.cos(t),rz*Math.sin(t)*Math.sin(a)]));}}
   p.push(V(center,[0,-ry,0]));const faces=[];
   for(let i=0;i<sides;i++){faces.push([0,1+i,1+(i+1)%sides]);for(let j=0;j<rows-2;j++){let k=1+j*sides;faces.push([k+i,k+(i+1)%sides,k+(i+1)%sides+sides,k+i+sides]);}let k=1+(rows-2)*sides;faces.push([p.length-1,k+i,k+(i+1)%sides]);}
   convex(p,faces,center,material,part.smooth?q=>q.map((x,i)=>(x-center[i])/(part.size[i]*part.size[i])):null);
  }else if(kind==='mesh'){
   const {vertices,triangles}=part;if(!Array.isArray(vertices)||!Array.isArray(triangles)||vertices.length>20000||triangles.length>24000||!vertices.every(v=>v.length===3&&v.every(Number.isFinite)))throw Error('bad mesh');
   const normals=vertices.map(()=>[0,0,0]);for(const ids of triangles){if(ids.length!==3||ids.some(i=>!Number.isInteger(i)||i<0||i>=vertices.length))throw Error('bad mesh index');const [a,b,c]=ids.map(i=>vertices[i]);const n=X(S(b,a),S(c,a));if(Math.hypot(...n)<1e-9)throw Error('degenerate mesh face');for(const i of ids)normals[i]=V(normals[i],n);}
   for(const ids of triangles){const [a,b,c]=ids.map(i=>vertices[i]);triangle(material,a,b,c,null,part.smooth?ids.map(i=>normals[i]):null);}
  }else if(kind==='ring'){
   const {radius:r,tube:t}=part;const sides=part.sides??20, segments=part.segments??6;const arc=part.arc??TAU;
   if(!(r>t&&t>0&&arc>0&&arc<=TAU&&sides>=3&&segments>=3))throw Error('bad ring');
   const w=U(part.axis??[0,0,1]);const u=U(X(Math.abs(w[1])>.9?[1,0,0]:[0,1,0],w));const v=X(w,u);
   const closed=Math.abs(arc-TAU)<1e-8;const start=part.start??0;
   const ringCenter=i=>V(center,M(V(M(u,Math.cos(start+arc*i/sides)),M(v,Math.sin(start+arc*i/sides))),r));
   const point=(i,j)=>{let a=start+arc*i/sides,b=TAU*j/segments;return V(center,V(M(V(M(u,Math.cos(a)),M(v,Math.sin(a))),r+t*Math.cos(b)),M(w,t*Math.sin(b))));};
   for(let i=0;i<sides;i++)for(let j=0;j<segments;j++){
    const a=point(i,j),b=point(i+1,j),c=point(i+1,j+1),d=point(i,j+1);const hint=S(M(V(V(a,b),c),1/3),M(V(ringCenter(i),ringCenter(i+1)),.5));triangle(material,a,b,c,hint);triangle(material,a,c,d,hint);
   }
   if(!closed)for(const i of [0,sides]){const a=ringCenter(i);const diff=i===0?S(a,ringCenter(1)):S(a,ringCenter(sides-1));for(let j=0;j<segments;j++)triangle(material,a,point(i,j),point(i,j+1),diff);}
  }else throw Error('unknown shape '+kind);
 }
 if(!parts.length||tris<1||tris>24000)throw Error('empty/excessive mesh');
 return {groups,min,max,tris,parts:parts.length};
}
function ascii(s){const out=new Uint8Array(s.length);for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c>127)throw Error('ASCII metadata only');out[i]=c;}return out;}
function glb(name,parts){
 const compiled=compile(parts),{groups,min,max,tris}=compiled;
 const j={asset:{version:'2.0',generator:'Attunement deterministic originals v1'},scene:0,scenes:[{nodes:[0]}],nodes:[{name,mesh:0}],meshes:[{name,primitives:[]}],materials:[],accessors:[],bufferViews:[],buffers:[{byteLength:0}]};
 const chunks=[];let offset=0;
 function accessor(data,type,bounds){const bytes=new Uint8Array(data.length*4),dv=new DataView(bytes.buffer);for(let i=0;i<data.length;i++)dv.setFloat32(i*4,data[i],true);let bi=j.bufferViews.length;j.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target:34962});offset+=bytes.length;chunks.push(bytes);let ai=j.accessors.length;let a={bufferView:bi,componentType:5126,count:data.length/(type==='VEC3'?3:2),type};if(bounds){let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<data.length;i++){lo[i%3]=Math.min(lo[i%3],data[i]);hi[i%3]=Math.max(hi[i%3],data[i]);}a.min=lo;a.max=hi;}j.accessors.push(a);return ai;}
 for(const [material,g] of groups){const mi=j.materials.length;j.materials.push({name:material,...MATERIALS[material]});j.meshes[0].primitives.push({attributes:{POSITION:accessor(g.p,'VEC3',true),NORMAL:accessor(g.n,'VEC3'),TEXCOORD_0:accessor(g.uv,'VEC2')},material:mi,mode:4});}
 j.buffers[0].byteLength=offset;const json=ascii(JSON.stringify(j)),pad=(4-json.length%4)%4,total=12+8+json.length+pad+8+offset;
 const out=new Uint8Array(total),d=new DataView(out.buffer);d.setUint32(0,0x46546c67,true);d.setUint32(4,2,true);d.setUint32(8,total,true);d.setUint32(12,json.length+pad,true);d.setUint32(16,0x4e4f534a,true);out.set(json,20);out.fill(32,20+json.length,20+json.length+pad);let cursor=20+json.length+pad;d.setUint32(cursor,offset,true);d.setUint32(cursor+4,0x004e4942,true);cursor+=8;for(const c of chunks){out.set(c,cursor);cursor+=c.length;}
 return {bytes:out,stats:{triangles:tris,materials:groups.size,parts:compiled.parts,min,max,bytes:out.length}};
}
// Checks independent of exporter internals: GLB header, chunk bounds, accessor ranges,
// finite normals/positions, material indices and positive non-zero bounding volume.
function verify(bytes,maxTriangles=24000){
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);const len=dv.getUint32(12,true);const start=20+len;
 if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==bytes.length||dv.getUint32(16,true)!==0x4e4f534a||len%4||start+8>bytes.length||dv.getUint32(start+4,true)!==0x004e4942)throw Error('invalid GLB header');
 const json=JSON.parse(Array.from(bytes.slice(20,start),x=>String.fromCharCode(x)).join(''));const bin=dv.getUint32(start,true);if(start+8+bin!==bytes.length||json.buffers[0].byteLength!==bin)throw Error('invalid BIN length');
 let triangles=0;
 for(const p of json.meshes[0].primitives){
  const pa=json.accessors[p.attributes.POSITION],na=json.accessors[p.attributes.NORMAL],ua=json.accessors[p.attributes.TEXCOORD_0];
  if(!json.materials[p.material]||pa.count%3||pa.count!==na.count||pa.count!==ua.count)throw Error('invalid primitive');triangles+=pa.count/3;
  for(const [a,n] of [[pa,3],[na,3],[ua,2]]){const v=json.bufferViews[a.bufferView];if(v.byteOffset%4||v.byteLength!==a.count*n*4||v.byteOffset+v.byteLength>bin)throw Error('accessor range');for(let k=0;k<a.count;k++){const vals=Array.from({length:n},(_,i)=>dv.getFloat32(start+8+v.byteOffset+(k*n+i)*4,true));if(!vals.every(Number.isFinite))throw Error('nonfinite');if(a===na&&Math.abs(Math.hypot(...vals)-1)>2e-5)throw Error('non-unit normal');if(a===pa&&vals.some((x,i)=>x<a.min[i]-1e-6||x>a.max[i]+1e-6))throw Error('bounds');}}
 }
 if(!(triangles>0&&triangles<=maxTriangles))throw Error('triangle budget');return triangles;
}
function random(seed){let s=seed>>>0;return()=>{s=(1664525*s+1013904223)>>>0;return s/4294967296;};}
function kit(){const parts=[];return {parts,box:(material,center,size,opts={})=>parts.push({kind:'box',material,center,size,...opts}),rod:(material,a,b,r,opts={})=>parts.push({kind:'rod',material,a,b,r,...opts}),crystal:(material,a,b,r,opts={})=>parts.push({kind:'crystal',material,a,b,r,...opts}),orb:(material,center,size,opts={})=>parts.push({kind:'orb',material,center,size,...opts}),ring:(material,center,radius,tube,opts={})=>parts.push({kind:'ring',material,center,radius,tube,...opts})};}
export {compile,glb,verify,random,kit,MATERIALS};
