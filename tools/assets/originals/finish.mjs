import { glb } from './geometry.mjs';
import { png } from './image.mjs';
// Repeatable material-local PBR studies, embedded in self-contained GLBs.
// Existing planar metre UVs are retained; no claim of hand-unwrapped hero meshes.
const SIZE=64,clamp=(v,a=0,b=255)=>Math.max(a,Math.min(b,Math.round(v)));
const srgb=x=>255*(x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055);
const hash=(x,y,s)=>{let h=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(s,1274126177);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
const fract=x=>x-Math.floor(x);
function noise(u,v,n,s){const x=u*n,y=v*n,i=Math.floor(x),j=Math.floor(y),f=fract(x),g=fract(y),a=f*f*(3-2*f),b=g*g*(3-2*g),w=k=>((k%n)+n)%n;return (hash(w(i),w(j),s)*(1-a)+hash(w(i+1),w(j),s)*a)*(1-b)+(hash(w(i),w(j+1),s)*(1-a)+hash(w(i+1),w(j+1),s)*a)*b;}
export function materialMaps(material){
 const id=material.name,p=material.pbrMetallicRoughness,seed=[...id].reduce((a,c)=>Math.imul(a,31)+c.charCodeAt(0),417),fabric=id==='fabric',rubber=id==='black',paint=['ceramic','ochre','red'].includes(id),metal=['frame','steel','copper'].includes(id);
 if(!fabric&&!rubber&&!paint&&!metal)return null;
 const c=p.baseColorFactor.slice(0,3).map(srgb),base=new Uint8Array(SIZE*SIZE*3),normal=new Uint8Array(base.length),orm=new Uint8Array(base.length);
 function surf(u,v){u=fract(u);v=fract(v);const large=noise(u,v,5,seed),fine=noise(u,v,23,seed+31),pit=noise(u,v,13,seed+71),wear=noise(u,v,8,seed+9),brush=Math.sin((u*3+v*21)*Math.PI*2),weave=Math.sin(u*Math.PI*32)*Math.sin(v*Math.PI*32),scratch=metal&&fine>.65&&brush>.88,chip=paint&&wear>.72&&fine>.47;const h=(large-.5)*.016+(fine-.5)*.023+(fabric?weave*.018:metal?brush*.003:0)-(chip?.022:0)-(scratch?.011:0);return {large,fine,pit,wear,h,chip,scratch,weave};}
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const u=x/SIZE,v=y/SIZE,s=surf(u,v),i=(y*SIZE+x)*3,e=1/SIZE;
  const dx=(surf(u+e,v).h-surf(u-e,v).h)*2,dy=(surf(u,v+e).h-surf(u,v-e).h)*2,l=Math.hypot(dx,dy,1);
  const tone=(s.large-.5)*34+(s.fine-.5)*23+(fabric?s.weave*13:0)-(s.pit<.25?13:0)+(s.scratch?32:0);
  base.set((s.chip?[113,111,104]:c).map(a=>clamp(a+tone)),i);normal.set([clamp(127.5-127.5*dx/l),clamp(127.5+127.5*dy/l),clamp(127.5+127.5/l)],i);
  orm.set([clamp(250-Math.max(0,.4-s.pit)*42),clamp((s.chip?.43:p.roughnessFactor)*255+(s.fine-.5)*37),clamp((s.chip?.78:paint||fabric||rubber?0:p.metallicFactor)*255)],i);
 }
 return {base,normal,orm};
}
export function finishedGLB(name,parts,uvScale=5){
 const original=glb(name,parts),bytes=original.bytes,dv=new DataView(bytes.buffer),n=dv.getUint32(12,true),start=20+n;
 const j=JSON.parse(Array.from(bytes.slice(20,start),b=>String.fromCharCode(b)).join(''));
 const bin=bytes.slice(start+8),chunks=[bin];let offset=bin.length;
 j.images=[];j.textures=[];j.samplers=[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];
 function texture(raw){const encoded=png(SIZE,SIZE,raw),pad=(4-encoded.length%4)%4,index=j.bufferViews.length;j.bufferViews.push({buffer:0,byteOffset:offset,byteLength:encoded.length});chunks.push(encoded,new Uint8Array(pad));offset+=encoded.length+pad;const source=j.images.length;j.images.push({bufferView:index,mimeType:'image/png'});return j.textures.push({sampler:0,source})-1;}
 const uvView=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
 for(const prim of j.meshes[0].primitives){const m=j.materials[prim.material],maps=materialMaps(m);if(!maps)continue;
  const p=m.pbrMetallicRoughness;p.baseColorFactor=[1,1,1,1];p.metallicFactor=1;p.roughnessFactor=1;p.baseColorTexture={index:texture(maps.base)};m.normalTexture={index:texture(maps.normal),scale:.65};const orm=texture(maps.orm);p.metallicRoughnessTexture={index:orm};m.occlusionTexture={index:orm,strength:.6};
  const a=j.accessors[prim.attributes.TEXCOORD_0],v=j.bufferViews[a.bufferView];for(let i=0;i<a.count*2;i++){const at=v.byteOffset+i*4;uvView.setFloat32(at,uvView.getFloat32(at,true)*uvScale,true);}
 }
 j.asset.generator='Attunement original PBR study v2';j.buffers[0].byteLength=offset;
 const json=Uint8Array.from(JSON.stringify(j),c=>c.charCodeAt(0)),pad=(4-json.length%4)%4,start2=20+json.length+pad,out=new Uint8Array(start2+8+offset),d=new DataView(out.buffer);
 d.setUint32(0,0x46546c67,true);d.setUint32(4,2,true);d.setUint32(8,out.length,true);d.setUint32(12,json.length+pad,true);d.setUint32(16,0x4e4f534a,true);out.set(json,20);out.fill(32,20+json.length,start2);d.setUint32(start2,offset,true);d.setUint32(start2+4,0x004e4942,true);let pos=start2+8;for(const c of chunks){out.set(c,pos);pos+=c.length;}
 return {bytes:out,stats:{...original.stats,bytes:out.length,textures:j.textures.length}};
}
