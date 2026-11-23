// Deterministic hard-surface GLB topology refinement for the seven-piece
// Silent Foundry kit. It preserves the source's Meshopt-compressed geometry,
// UV-baked PBR materials, names, scale and gameplay placement, and grafts
// fully authored new production meshes (flanges, couplings, collar rings,
// fasteners, gussets and inspection panels) onto the existing piece roots.
// No texture re-encoding, no dependency on Blender/Node for the core function.
// CLI: node tools/assets/refine-foundry-glb.mjs <input.glb> <output.glb>
const ABC='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decode64(str) {
  const t={};for(let i=0;i<64;i++)t[ABC[i]]=i;
  const s=str.replace(/\s/g,'');const n=Math.floor(s.length*3/4)-(s.endsWith('==')?2:s.endsWith('=')?1:0);
  const bytes=new Uint8Array(n);let k=0;
  for(let i=0;i<s.length;i+=4){
    const v=(t[s[i]]<<18)|(t[s[i+1]]<<12)|((t[s[i+2]]||0)<<6)|(t[s[i+3]]||0);
    bytes[k++]=(v>>>16)&255;if(k<n)bytes[k++]=(v>>>8)&255;if(k<n)bytes[k++]=v&255;
  }
  return bytes;
}
function encode64(a) {
  const parts=[];let s='';
  for(let i=0;i<a.length;i+=3){
    const n=(a[i]<<16)|((a[i+1]||0)<<8)|(a[i+2]||0);
    s+=ABC[(n>>>18)&63]+ABC[(n>>>12)&63]+(i+1<a.length?ABC[(n>>>6)&63]:'=')+(i+2<a.length?ABC[n&63]:'=');
    if(s.length>40000){parts.push(s);s='';}
  }
  parts.push(s);return parts.join('');
}
function utf8Encode(s){
 const out=[];for(const char of s){const cp=char.codePointAt(0);
  if(cp<128)out.push(cp);else if(cp<2048)out.push(192|(cp>>6),128|(cp&63));
  else if(cp<65536)out.push(224|(cp>>12),128|((cp>>6)&63),128|(cp&63));
  else out.push(240|(cp>>18),128|((cp>>12)&63),128|((cp>>6)&63),128|(cp&63));
 }return Uint8Array.from(out);
}
function utf8Decode(a){
 let s='';for(let i=0;i<a.length;i++){
  let c=a[i];if(c<128){s+=String.fromCharCode(c);continue;}
  if((c&224)===192){s+=String.fromCharCode(((c&31)<<6)|(a[++i]&63));continue;}
  if((c&240)===224){s+=String.fromCharCode(((c&15)<<12)|((a[++i]&63)<<6)|(a[++i]&63));continue;}
  if((c&248)===240){let cp=((c&7)<<18)|((a[++i]&63)<<12)|((a[++i]&63)<<6)|(a[++i]&63);cp-=65536;s+=String.fromCharCode(0xd800+(cp>>10),0xdc00+(cp&1023));continue;}
  throw Error('Invalid UTF-8 GLB JSON');
 }return s;
}
const FINISH={steel:[129,146,153,255],bronze:[184,131,75,255],ceramic:[184,192,190,255],dark:[78,88,97,255],hazard:[196,149,69,255]};
function Geometry(){
 const p=[],n=[],c=[],i=[];
 const vertex=(pt,no,col)=>{const j=p.length/3;p.push(...pt);n.push(...no);c.push(...FINISH[col]);return j;};
 const quad=(a,b,d,e,col)=>{const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[e[0]-a[0],e[1]-a[1],e[2]-a[2]];
   const nn=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
   const size=Math.hypot(...nn)||1,no=nn.map(x=>x/size);
   const ids=[a,b,d,e].map(x=>vertex(x,no,col));i.push(ids[0],ids[1],ids[2],ids[0],ids[2],ids[3]);};
 const box=(x,y,z,hx,hy,hz,col)=>{const X=x-hx,P=x+hx,Y=y-hy,Q=y+hy,Z=z-hz,V=z+hz;
   quad([X,Y,V],[P,Y,V],[P,Q,V],[X,Q,V],col);
   quad([P,Y,Z],[X,Y,Z],[X,Q,Z],[P,Q,Z],col);
   quad([X,Y,Z],[X,Y,V],[X,Q,V],[X,Q,Z],col);
   quad([P,Y,V],[P,Y,Z],[P,Q,Z],[P,Q,V],col);
   quad([X,Q,V],[P,Q,V],[P,Q,Z],[X,Q,Z],col);
   quad([X,Y,Z],[P,Y,Z],[P,Y,V],[X,Y,V],col);
 };
 const tubeY=(x,z,y0,y1,r,segments,col)=>{
  const first=p.length/3;for(let k=0;k<=segments;k++){
   const a=k/segments*Math.PI*2,co=Math.cos(a),si=Math.sin(a);
   vertex([x+r*co,y0,z+r*si],[co,0,si],col);
   vertex([x+r*co,y1,z+r*si],[co,0,si],col);
  }
  for(let k=0;k<segments;k++){const a=first+2*k,b=a+2;i.push(a,a+1,b+1,a,b+1,b);}
 };
 const torusY=(x,y,z,R,r,major,minor,col)=>{
  const first=p.length/3;
  for(let k=0;k<=major;k++){const a=k/major*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a);
   for(let t=0;t<=minor;t++){const b=t/minor*Math.PI*2,cb=Math.cos(b),sb=Math.sin(b);
    const rr=R+r*cb;vertex([x+rr*ca,y+r*sb,z+rr*sa],[ca*cb,sb,sa*cb],col);
   }
  }
  for(let k=0;k<major;k++)for(let t=0;t<minor;t++){const a=first+k*(minor+1)+t,b=a+minor+1;i.push(a,a+1,b,b,a+1,b+1);}
 };
 const fastenerZ=(x,y,z,r,col='bronze')=>{
   const count=12,front=z+0.035,base=p.length/3;
   for(let k=0;k<=count;k++){const a=k/count*Math.PI*2,co=Math.cos(a),si=Math.sin(a);
    vertex([x+r*co,y+r*si,z],[co,si,0],col);
    vertex([x+r*co,y+r*si,front],[co,si,0],col);
   }
   for(let k=0;k<count;k++){const a=base+2*k,b=a+2;i.push(a,b,a+1,b,b+1,a+1);}
   const middle=vertex([x,y,front],[0,0,1],col);
   for(let k=0;k<count;k++){const a=k/count*Math.PI*2,b=(k+1)/count*Math.PI*2;
    const va=vertex([x+r*Math.cos(a),y+r*Math.sin(a),front],[0,0,1],col);
    const vb=vertex([x+r*Math.cos(b),y+r*Math.sin(b),front],[0,0,1],col);
    i.push(middle,va,vb);
   }
 };
 return{p,n,c,i,box,tubeY,torusY,fastenerZ};
}
function makePiece(name,g){
 const {box,tubeY,torusY,fastenerZ}=g;
 if(name==='Wall_Bay'){
  for(const x of [-3.6,0,3.6])for(const y of [2.35,4.35,8.15,10.35]){
   box(x,y,0.865,0.72,0.62,0.055,'ceramic');
   for(const dx of [-0.53,0.53])for(const dy of [-0.42,0.42])fastenerZ(x+dx,y+dy,0.94,0.07,'bronze');
  }
  for(const y of [6.85,12.85]){
   box(0,y,0.9,4.3,0.085,0.07,'steel');
   for(const x of [-4,-2,0,2,4])fastenerZ(x,y,1,0.095,'bronze');
  }
 } else if(name==='Press'){
  for(const x of [-1.6,1.6]){
   tubeY(x,0,1.1,5.55,0.20,32,'bronze');
   for(const y of [1.12,2.1,3.9,5.4])torusY(x,y,0,0.24,0.055,32,8,'steel');
   box(x,5.45,0,0.42,0.15,0.42,'dark');
  }
  for(const side of [-1,1]){
   const z=side*2.7;for(const y of [1.1,4.85]){
    box(0,y,z,1.95,0.16,0.13,'ceramic');
    for(const x of [-1.55,1.55])fastenerZ(x,y,z+0.17,0.12);
   }
  }
  for(let x=-1.2;x<=1.2;x+=0.6)box(x,2.1,3.16,0.10,0.54,0.09,'bronze');
 } else if(name==='Vat_Frame'){
  for(const y of [0.52,1.18,3.84,4.5])torusY(0,y,0,2.25,0.075,64,10,y>3?'bronze':'steel');
  for(const k of [0,1,2,3,4,5,6,7]){
   const a=k*Math.PI/4,x=2.31*Math.cos(a),z=2.31*Math.sin(a);
   tubeY(x,z,0.65,4.32,0.055,16,'steel');
   box(x,2.38,z,0.11,0.33,0.11,'dark');
  }
  for(const x of [-1.25,1.25])for(const z of [-1.35,1.35])torusY(x,4.8,z,0.36,0.055,24,8,'bronze');
 } else if(name==='Resonator_Base'){
  for(const [y,r] of [[0.36,4.05],[0.88,3.4],[1.23,2.34]])torusY(0,y,0,r,0.10,64,10,'bronze');
  for(let k=0;k<8;k++){
   const a=k*Math.PI/4,x=3.45*Math.cos(a),z=3.45*Math.sin(a);
   tubeY(x,z,0.25,0.88,0.15,20,'steel');
   torusY(x,0.72,z,0.18,0.05,20,8,'hazard');
  }
 } else if(name==='Pylon'){
  for(const [y,r] of [[0.53,1.15],[1.2,0.98],[3.3,0.75],[5.8,0.65],[6.52,0.6]]){
    torusY(0,y,0,r,0.085,48,8,y===6.52?'bronze':'steel');
  }
  for(let k=0;k<8;k++){
   const a=k*Math.PI/4,x=0.72*Math.cos(a),z=0.72*Math.sin(a);
   tubeY(x,z,1.32,5.85,0.045,12,'bronze');
  }
 } else if(name==='Door_Frame'){
  for(const x of [-4.28,4.28]){
   for(const y of [0.6,1.6,2.6,3.6,4.6,5.6,6.6,7.45]){
    fastenerZ(x,y,1.24,0.12);
    box(x,y,1.18,0.27,0.13,0.10,'ceramic');
   }
   tubeY(x,1.19,0.5,7.45,0.09,24,'bronze');
  }
  for(const x of [-2.4,-1.2,0,1.2,2.4]){box(x,8.35,1.23,0.15,0.23,0.12,'ceramic');fastenerZ(x,8.35,1.4,0.10);}
 } else if(name==='Truss'){
  for(const x of [-5.75,-4.25,-2.75,-1.25,0.25,1.75,3.25,4.75,5.75]){
   for(const z of [-0.5,0.5]){
    box(x,1.35,z,0.19,0.10,0.16,'steel');
    box(x,0.10,z,0.15,0.10,0.12,'dark');
   }
  }
 }
}
export function refineFoundryGlb(base64) {
 const bytes=decode64(base64);const rd=new DataView(bytes.buffer);
 if(rd.getUint32(0,true)!==0x46546c67||rd.getUint32(4,true)!==2||rd.getUint32(8,true)!==bytes.length)throw Error('Invalid GLB v2 header');
 const jsonLen=rd.getUint32(12,true),jsonType=rd.getUint32(16,true);
 if(jsonType!==0x4e4f534a)throw Error('Expected JSON chunk');
 const model=JSON.parse(utf8Decode(bytes.subarray(20,20+jsonLen)));
 if(model.extras?.attunementFoundryRemesh) return {base64:base64.replace(/\s/g,''),report:{alreadyRefined:true,...model.extras.attunementFoundryRemesh}};
 const binOffset=20+jsonLen,binLen=rd.getUint32(binOffset,true);
 if(rd.getUint32(binOffset+4,true)!==0x004e4942)throw Error('Expected BIN chunk');
 if(model.buffers?.[0]?.byteLength!==binLen)throw Error('BIN/buffer zero length mismatch');
 const bin=bytes.subarray(binOffset+8,binOffset+8+binLen);
 const chunks=[bin];let size=bin.length;
 function addData(input,target) {
   const fill=(4-(size%4))%4;if(fill){chunks.push(new Uint8Array(fill));size+=fill;}
   const off=size;chunks.push(input);size+=input.length;
   const index=model.bufferViews.length;model.bufferViews.push({buffer:0,byteOffset:off,byteLength:input.length,target});return index;
 }
 function floats(a) {const o=new Uint8Array(a.length*4),d=new DataView(o.buffer);for(let i=0;i<a.length;i++)d.setFloat32(i*4,a[i],true);return o;}
 function ints(a) {const o=new Uint8Array(a.length*4),d=new DataView(o.buffer);for(let i=0;i<a.length;i++)d.setUint32(i*4,a[i],true);return o;}
 const material=model.materials.length;
 model.materials.push({name:'FK_RefinedHardSurface',doubleSided:false,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0.68,roughnessFactor:0.43}});
 const stats={revision:1,pieces:{},addedTriangles:0,addedMeshes:0,preservedBaseMeshes:model.meshes.length};
 for(const piece of ['Wall_Bay','Press','Vat_Frame','Resonator_Base','Pylon','Door_Frame','Truss']){
  const rootIndex=model.nodes.findIndex(n=>n.name===piece);
  if(rootIndex<0)throw Error('Missing runtime kit node: '+piece);
  const geom=Geometry();makePiece(piece,geom);
  if(geom.p.length!==geom.n.length||geom.c.length/4!==geom.p.length/3||geom.i.some(x=>x>=geom.p.length/3))throw Error('Invalid '+piece+' topology');
  const bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
  for(let i=0;i<geom.p.length;i+=3)for(let k=0;k<3;k++){
    const v=geom.p[i+k];if(!Number.isFinite(v))throw Error('Nonfinite '+piece+' vertex');
    bounds[0][k]=Math.min(bounds[0][k],v);bounds[1][k]=Math.max(bounds[1][k],v);
  }
  const bvPos=addData(floats(geom.p),34962);
  const bvNorm=addData(floats(geom.n),34962);
  const bvCol=addData(Uint8Array.from(geom.c),34962);
  const bvIdx=addData(ints(geom.i),34963);
  const addAcc=(accessor)=>{model.accessors.push(accessor);return model.accessors.length-1;};
  const count=geom.p.length/3;
  const pos=addAcc({bufferView:bvPos,componentType:5126,count,type:'VEC3',min:bounds[0],max:bounds[1]});
  const nor=addAcc({bufferView:bvNorm,componentType:5126,count,type:'VEC3'});
  const col=addAcc({bufferView:bvCol,componentType:5121,normalized:true,count,type:'VEC4'});
  const idx=addAcc({bufferView:bvIdx,componentType:5125,count:geom.i.length,type:'SCALAR',min:[0],max:[count-1]});
  const mesh=model.meshes.length;
  model.meshes.push({name:piece+'_HardSurface',primitives:[{attributes:{POSITION:pos,NORMAL:nor,COLOR_0:col},indices:idx,material,mode:4}]});
  const root=model.nodes[rootIndex];
  const rootScale=root.scale||[1,1,1],rootTranslation=root.translation||[0,0,0];
  if(root.rotation)throw Error('Unexpected rotated source root: '+piece);
  const node={name:piece+'_HardSurface',mesh,
    scale:rootScale.map(s=>1/s),translation:rootTranslation.map((v,i)=>-v/rootScale[i])};
  const nodeIndex=model.nodes.length;model.nodes.push(node);
  root.children=[...(root.children||[]),nodeIndex];
  stats.addedTriangles+=geom.i.length/3;stats.addedMeshes++;
  stats.pieces[piece]={triangles:geom.i.length/3,vertices:count};
 }
 const padding=(4-(size%4))%4;if(padding){chunks.push(new Uint8Array(padding));size+=padding;}
 model.buffers[0].byteLength=size;
 model.extras={...(model.extras||{}),attunementFoundryRemesh:stats};
 let json=utf8Encode(JSON.stringify(model));const pad=(4-json.length%4)%4;
 const total=12+8+json.length+pad+8+size;const out=new Uint8Array(total),w=new DataView(out.buffer);
 w.setUint32(0,0x46546c67,true);w.setUint32(4,2,true);w.setUint32(8,total,true);
 w.setUint32(12,json.length+pad,true);w.setUint32(16,0x4e4f534a,true);
 out.set(json,20);out.fill(32,20+json.length,20+json.length+pad);
 const pos=20+json.length+pad;
 w.setUint32(pos,size,true);w.setUint32(pos+4,0x004e4942,true);
 let offset=pos+8;for(const c of chunks){out.set(c,offset);offset+=c.length;}
 if(offset!==total)throw Error('GLB byte count mismatch');
 return{base64:encode64(out),report:{...stats,bytes:total,originalBytes:bytes.length}};
}
// CLI ENTRY: used for rebuilding from a baseline GLB in a checked-out repo.
if(typeof process!=='undefined'&&process.argv?.[1]?.endsWith('refine-foundry-glb.mjs')){
 const fs=await import('node:fs');
 const src=process.argv[2],dest=process.argv[3];
 if(!src||!dest)throw Error('Usage: node refine-foundry-glb.mjs input.glb output.glb');
 const r=refineFoundryGlb(fs.readFileSync(src).toString('base64'));
 fs.writeFileSync(dest,Buffer.from(r.base64,'base64'));
 console.log(JSON.stringify(r.report,null,2));
}
