// Deterministic rifle GLB extraction into the owner's active production-pipeline workspace.
// All archive donors are available to the production pipeline; this exporter
// selects two equipment variants for the Warden visual integration.
// Source meshes are NOT finished art: runtime renderer upgrades materials and
// adds Attunement-specific receiver, sights, barrel details and restrained VFX.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ARCHIVE=path.join(ROOT,'assets/source-archives/glb-low-poly-models-building-blocks.zip');
const SHA='a2e60f2a220ebf427f6211805d0a4aa11504205af91a62e2065ab18474977e43';
const MEMBER='glb-low-poly-models-building-blocks/model - FPS Survival Forest Outpost.glb';
export const WARDEN_RIFLE_NODES=Object.freeze({carbine:'097-weapon-scout-carbine',marksman:'098-weapon-marksman-rifle'});
const OUTPUT=path.join(ROOT,'.asset-cache','pipeline','warden_rifles');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const align=n=>(n+3)&~3;

function zipMember(zip,name){
 let e=-1;
 for(let i=zip.length-22;i>=Math.max(0,zip.length-65557);i--){
  if(zip.readUInt32LE(i)===0x06054b50&&i+22+zip.readUInt16LE(i+20)===zip.length){e=i;break;}
 }
 if(e<0||zip.readUInt16LE(e+4)||zip.readUInt16LE(e+6))throw Error('Invalid or multi-disk source ZIP');
 let p=zip.readUInt32LE(e+16);
 for(let i=0;i<zip.readUInt16LE(e+10);i++){
  if(p+46>zip.length||zip.readUInt32LE(p)!==0x02014b50)throw Error('Broken ZIP directory');
  const namelen=zip.readUInt16LE(p+28),extra=zip.readUInt16LE(p+30),comment=zip.readUInt16LE(p+32);
  const n=zip.toString('utf8',p+46,p+46+namelen);
  if(n===name){
   const method=zip.readUInt16LE(p+10),compressed=zip.readUInt32LE(p+20),size=zip.readUInt32LE(p+24);
   if(size>32_000_000||compressed>zip.length)throw Error('Source GLB above size limit');
   const loc=zip.readUInt32LE(p+42);
   if(loc+30>zip.length||zip.readUInt32LE(loc)!==0x04034b50)throw Error('Bad ZIP local header');
   const start=loc+30+zip.readUInt16LE(loc+26)+zip.readUInt16LE(loc+28);
   if(start+compressed>zip.length)throw Error('Truncated ZIP member');
   const bytes=zip.subarray(start,start+compressed);
   const out=method===0?bytes:method===8?inflateRawSync(bytes,{maxOutputLength:32_000_000}):null;
   if(!out||out.length!==size)throw Error('Unsupported or corrupt ZIP member');
   return out;
  }
  p+=46+namelen+extra+comment;
 }
 throw Error('Selected rifle donor GLB is missing');
}

export function extractRifleGroup(raw,nodeName){
 if(raw.toString('ascii',0,4)!=='glTF'||raw.readUInt32LE(4)!==2||raw.readUInt32LE(8)!==raw.length)throw Error('Invalid GLB source');
 const jlen=raw.readUInt32LE(12),binOffset=20+jlen;
 if(raw.readUInt32LE(16)!==0x4e4f534a||raw.readUInt32LE(binOffset+4)!==0x004e4942)throw Error('Missing GLB chunks');
 const src=JSON.parse(raw.toString('utf8',20,20+jlen));
 const bin=raw.subarray(binOffset+8,binOffset+8+raw.readUInt32LE(binOffset));
 const candidates=src.nodes.map((n,i)=>n.name===nodeName?i:-1).filter(i=>i>=0);
 if(candidates.length!==1)throw Error('Expected one exact rifle source node: '+nodeName);
 const dst={asset:{version:'2.0',generator:'Attunement rifle source isolation'},scenes:[{nodes:[0]}],scene:0,nodes:[],meshes:[],accessors:[],bufferViews:[],buffers:[],materials:[]};
 const maps={node:new Map(),mesh:new Map(),accessor:new Map(),material:new Map()};
 const chunks=[];let total=0;
 const bytesFor={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
 const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
 function access(id){
  if(maps.accessor.has(id))return maps.accessor.get(id);
  const a=src.accessors[id],view=src.bufferViews[a?.bufferView];
  if(!a||!view||a.sparse||view.buffer!==0)throw Error('Unsupported rifle accessor');
  const item=bytesFor[a.componentType]*components[a.type];
  const start=(view.byteOffset||0)+(a.byteOffset||0),length=view.byteStride?(a.count-1)*view.byteStride+item:a.count*item;
  if(!item||start+length>(view.byteOffset||0)+view.byteLength||start+length>bin.length)throw Error('Malformed rifle data');
  const vi=dst.bufferViews.length,ai=dst.accessors.length;
  dst.bufferViews.push({buffer:0,byteOffset:total,byteLength:length,...(view.byteStride?{byteStride:view.byteStride}:{}),...(view.target?{target:view.target}:{})});
  dst.accessors.push({...a,bufferView:vi,byteOffset:0});
  chunks.push(bin.subarray(start,start+length));total+=align(length);
  maps.accessor.set(id,ai);return ai;
 }
 function material(id){
  if(maps.material.has(id))return maps.material.get(id);
  const m=src.materials?.[id];
  if(!m||m.normalTexture||m.occlusionTexture||m.emissiveTexture||m.pbrMetallicRoughness?.baseColorTexture||m.pbrMetallicRoughness?.metallicRoughnessTexture)
   throw Error('Source rifle uses unreviewed textures; cannot isolate');
  const i=dst.materials.length;dst.materials.push(structuredClone(m));maps.material.set(id,i);return i;
 }
 function mesh(id){
  if(maps.mesh.has(id))return maps.mesh.get(id);
  const original=src.meshes[id];if(!original)throw Error('Missing selected rifle mesh');
  const i=dst.meshes.length;maps.mesh.set(id,i);
  const m=structuredClone(original);
  for(const p of m.primitives){
   if(p.targets?.length||p.extensions)throw Error('Unreviewed source morph/extensions');
   p.attributes=Object.fromEntries(Object.entries(p.attributes).map(([k,v])=>[k,access(v)]));
   if(p.indices!==undefined)p.indices=access(p.indices);
   if(p.material!==undefined)p.material=material(p.material);
  }
  dst.meshes.push(m);return i;
 }
 function node(id,root=false){
  if(maps.node.has(id))return maps.node.get(id);
  const original=src.nodes[id];if(!original||original.skin!==undefined)throw Error('Unexpected skinned source node');
  const i=dst.nodes.length;maps.node.set(id,i);
  const n=structuredClone(original);dst.nodes.push(n);
  if(n.mesh!==undefined)n.mesh=mesh(n.mesh);
  if(n.children)n.children=n.children.map(c=>node(c));
  if(root){delete n.translation;delete n.rotation;delete n.scale;delete n.matrix;}
  return i;
 }
 node(candidates[0],true);
 if(dst.meshes.length<2||dst.meshes.length>20||dst.accessors.length<3)throw Error('Suspicious rifle mesh extraction');
 dst.buffers=[{byteLength:total}];
 if(src.extensionsUsed?.includes('KHR_mesh_quantization'))dst.extensionsUsed=['KHR_mesh_quantization'];
 if(src.extensionsRequired?.includes('KHR_mesh_quantization'))dst.extensionsRequired=['KHR_mesh_quantization'];
 const json=Buffer.from(JSON.stringify(dst));const out=Buffer.alloc(12+8+align(json.length)+8+total,0);
 out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
 out.writeUInt32LE(align(json.length),12);out.writeUInt32LE(0x4e4f534a,16);
 json.copy(out,20);out.fill(0x20,20+json.length,20+align(json.length));
 const b=20+align(json.length);out.writeUInt32LE(total,b);out.writeUInt32LE(0x004e4942,b+4);
 let p=b+8;for(const c of chunks){c.copy(out,p);p+=align(c.length);}
 return out;
}
let cached=false;
export function ensureWardenRifleGLB(id){
 if(!Object.hasOwn(WARDEN_RIFLE_NODES,id))throw Error('Unexpected Warden rifle id');
 const file=path.join(OUTPUT,'sanctum-warden-'+id+'.glb');
 if(!cached){
  const zip=fs.readFileSync(ARCHIVE);
  if(hash(zip)!==SHA)throw Error('Owner archive hash mismatch: refusing rifle source');
  const raw=zipMember(zip,MEMBER);
  fs.mkdirSync(OUTPUT,{recursive:true});
  for(const [key,n] of Object.entries(WARDEN_RIFLE_NODES)){
   const out=extractRifleGroup(raw,n);
   const target=path.join(OUTPUT,'sanctum-warden-'+key+'.glb');
   fs.writeFileSync(target+'.tmp',out);fs.renameSync(target+'.tmp',target);
  }
  cached=true;
 }
 return file;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 for(const id of Object.keys(WARDEN_RIFLE_NODES)){const p=ensureWardenRifleGLB(id);console.log(id,fs.statSync(p).size,p);}
}
