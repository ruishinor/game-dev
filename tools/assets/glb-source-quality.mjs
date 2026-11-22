// Read-only, bounded GLB source-quality inventory. Never publishes or extracts
// donors to a browser-served path. Geometry/material metrics are screening
// signals, NOT evidence of artistic quality, licensing or production readiness.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const ARCHIVE_SHA256='a2e60f2a220ebf427f6211805d0a4aa11504205af91a62e2065ab18474977e43';
export const ARCHIVE_PATH=path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/source-archives/glb-low-poly-models-building-blocks.zip');
const MAX_MEMBER=80*1024*1024;
const MAX_SUM=400*1024*1024;
const BYTES={ZIP_ENTRY:0x02014b50,ZIP_LOCAL:0x04034b50,ZIP_END:0x06054b50,JSON:0x4e4f534a};

function field(data,at,len) {
  if(at<0 || len<0 || at+len>data.length) throw Error('Archive entry out of bounds');
}
export function* zipMembers(zip) {
  let end=-1;
  for(let i=zip.length-22;i>=Math.max(0,zip.length-65557);i--) {
    if(zip.readUInt32LE(i)===BYTES.ZIP_END && i+22+zip.readUInt16LE(i+20)===zip.length){end=i;break;}
  }
  if(end<0)throw Error('Missing ZIP central directory');
  const count=zip.readUInt16LE(end+10);
  let at=zip.readUInt32LE(end+16),total=0;
  if(zip.readUInt16LE(end+4)!==0 || zip.readUInt16LE(end+6)!==0 ||
      zip.readUInt16LE(end+8)!==count || zip.readUInt32LE(end+16)+zip.readUInt32LE(end+12)>end)
    throw Error('Spanned or inconsistent ZIP not supported');
  for(let i=0;i<count;i++){
    field(zip,at,46);
    if(zip.readUInt32LE(at)!==BYTES.ZIP_ENTRY)throw Error('Corrupt ZIP directory');
    const method=zip.readUInt16LE(at+10),size=zip.readUInt32LE(at+24),compressed=zip.readUInt32LE(at+20);
    const nameLength=zip.readUInt16LE(at+28),extra=zip.readUInt16LE(at+30),comment=zip.readUInt16LE(at+32);
    const offset=zip.readUInt32LE(at+42);
    field(zip,at,46+nameLength+extra+comment);
    const name=zip.toString('utf8',at+46,at+46+nameLength);
    at+=46+nameLength+extra+comment;
    if(!name.toLowerCase().endsWith('.glb'))continue;
    if(![0,8].includes(method)||size>MAX_MEMBER||compressed>MAX_MEMBER)throw Error('Invalid or excessive GLB ZIP payload '+name);
    total+=size;
    if(total>MAX_SUM)throw Error('Archive exceeds bounded extraction budget');
    field(zip,offset,30);
    if(zip.readUInt32LE(offset)!==BYTES.ZIP_LOCAL)throw Error('Corrupt ZIP local entry '+name);
    const start=offset+30+zip.readUInt16LE(offset+26)+zip.readUInt16LE(offset+28);
    field(zip,start,compressed);
    const payload=zip.subarray(start,start+compressed);
    const raw=method===0?payload:inflateRawSync(payload,{maxOutputLength:MAX_MEMBER});
    if(raw.length!==size)throw Error('GLB payload size mismatch '+name);
    yield {name,raw};
  }
}
export function readGltf(raw) {
  if(raw.length<20 || raw.toString('ascii',0,4)!=='glTF' ||
      raw.readUInt32LE(4)!==2 || raw.readUInt32LE(8)!==raw.length ||
      raw.readUInt32LE(16)!==BYTES.JSON)throw Error('Invalid GLB 2.0 header');
  const jsonSize=raw.readUInt32LE(12);
  if(jsonSize>raw.length-20)throw Error('Invalid GLB JSON bounds');
  const doc=JSON.parse(raw.toString('utf8',20,20+jsonSize));
  if(doc.asset?.version!=='2.0'||!Array.isArray(doc.meshes))throw Error('Invalid glTF 2.0 JSON');
  return doc;
}
const textureFields=[
  m=>m.pbrMetallicRoughness?.baseColorTexture,
  m=>m.pbrMetallicRoughness?.metallicRoughnessTexture,
  m=>m.normalTexture,m=>m.occlusionTexture,m=>m.emissiveTexture,
];
export function summarizeGltf(gltf) {
  const mesh=gltf.meshes||[],accessors=gltf.accessors||[],materials=gltf.materials||[];
  let primitives=0,triangles=0,normals=0,uvs=0,vertexColors=0;
  for(const m of mesh)for(const p of m.primitives||[]){
    primitives++;
    const a=accessors[p.indices??p.attributes?.POSITION],n=a?.count||0;
    const mode=p.mode??4;
    triangles+=mode===4?Math.floor(n/3):(mode===5||mode===6)?Math.max(0,n-2):0;
    normals+=p.attributes?.NORMAL!==undefined?1:0;
    uvs+=p.attributes?.TEXCOORD_0!==undefined?1:0;
    vertexColors+=p.attributes?.COLOR_0!==undefined?1:0;
  }
  const matMaps=materials.map(m=>textureFields.reduce((n,fn)=>n+(fn(m)?1:0),0));
  const qualitySignals=[];
  if(primitives && normals<primitives)qualitySignals.push('some_primitives_lack_normals');
  if(primitives && uvs<primitives)qualitySignals.push('some_primitives_lack_uv0');
  if(materials.length && matMaps.every(n=>n===0))qualitySignals.push('no_standard_pbr_texture_channels');
  if((gltf.skins||[]).length===0 && (gltf.animations||[]).length===0)qualitySignals.push('unrigged_static_source');
  return {
    nodes:(gltf.nodes||[]).length,meshes:mesh.length,primitives,triangles,
    normals,uv0:uvs,vertexColors,
    materials:materials.length,materialsWithTexture:matMaps.filter(n=>n>0).length,
    images:(gltf.images||[]).length,textures:(gltf.textures||[]).length,
    skins:(gltf.skins||[]).length,animations:(gltf.animations||[]).length,
    qualitySignals,
    rightsVerified:false,visualAcceptance:false,productionReady:false,
  };
}
export function auditArchive(zip) {
  const hash=crypto.createHash('sha256').update(zip).digest('hex');
  if(hash!==ARCHIVE_SHA256)throw Error('Source archive SHA-256 mismatch: '+hash);
  const models=[],byHash=new Map();
  for(const {name,raw} of zipMembers(zip)){
    const digest=crypto.createHash('sha256').update(raw).digest('hex');
    const row={name,bytes:raw.length,sha256:digest,...summarizeGltf(readGltf(raw))};
    models.push(row);
    if(!byHash.has(digest))byHash.set(digest,[]);
    byHash.get(digest).push(name);
  }
  if(models.length!==138)throw Error('Expected 138 source GLBs; found '+models.length);
  models.sort((a,b)=>a.name.localeCompare(b.name,'en'));
  return {
    archiveSha256:hash,sourceOnly:true,productionReady:false,
    summary:{models:models.length,triangles:models.reduce((n,m)=>n+m.triangles,0),
      withoutStandardPbrMaps:models.filter(m=>m.materials>0&&m.materialsWithTexture===0).length,
      unrigged:models.filter(m=>m.skins===0).length,
      duplicatedPairs:[...byHash.values()].filter(v=>v.length>1)},
    limitations:'No visual judgement, rights clearance, material texture quality, animation suitability or runtime performance is established.',
    models,
  };
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {process.stdout.write(JSON.stringify(auditArchive(fs.readFileSync(ARCHIVE_PATH)),null,2)+'\n');}
  catch(e){console.error('[glb-source-audit]',e.message);process.exitCode=1;}
}
