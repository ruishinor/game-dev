import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import validator from 'gltf-validator';
import sharp from 'sharp';
import { MODEL_SPECS } from '../tools/assets/originals/catalog.mjs';
import { verify } from '../tools/assets/originals/geometry.mjs';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../client/art-assets');
const read=rel=>fs.readFileSync(path.join(dir,rel));
// Git can check out text assets with CRLF. Verify canonical LF bytes and
// exact binary bytes against the committed manifest. Full generator replay
// is a separate asset-authoring check, not a gameplay regression gate.
test('original art: committed manifest inventory, sizes and hashes match',()=>{
 const manifest=JSON.parse(read('manifest.json'));assert.deepEqual(manifest.models,MODEL_SPECS);
 const expected=['manifest.json',...manifest.files.map(f=>f.path)].sort();
 assert.equal(new Set(expected).size,expected.length);
 const seen=fs.readdirSync(dir,{recursive:true}).filter(f=>fs.statSync(path.join(dir,f)).isFile()).map(x=>x.split(path.sep).join('/')).sort();
 assert.deepEqual(seen,expected);
 for(const entry of manifest.files){
  const raw=read(entry.path),bytes=/\.(json|svg)$/i.test(entry.path)?Buffer.from(raw.toString('utf8').replace(/\r\n/g,'\n'),'utf8'):raw;
  assert.equal(bytes.length,entry.bytes,entry.path);
  assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),entry.gitBlob,entry.path);
 }
});
test('original art: all 31 GLBs pass structural and Khronos validation',async()=>{
 for(const {file} of MODEL_SPECS){
  const data=new Uint8Array(read(file));assert.ok(verify(data,9000)>0,file);
  const report=await validator.validateBytes(data,{maxIssues:100000});
  const errors=report.issues.messages.filter(x=>x.severity===0).map(x=>x.code+' '+(x.pointer||''));
  assert.deepEqual(errors,[],file);
 }
});
test('original art: maps and all standalone glyphs decode',async()=>{
 const a=JSON.parse(read('industrial_atlas.json'));
 assert.equal(a.tiles.length,8);
 for(const file of Object.values(a.files)){
  const {data,info}=await sharp(read(file)).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,a.width);assert.equal(info.height,a.height);assert.equal(info.channels,3);
  assert.ok(data.some((v,i)=>v!==data[i%3]),file+' has no variation');
 }
 const icons=JSON.parse(read('glyphs/manifest.json'));assert.equal(icons.length,19);
 for(const icon of icons){const {data,info}=await sharp(read('glyphs/'+icon.file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.ok(info.width>0&&info.height>0);assert.ok(data.some((v,i)=>i%4===3&&v>0),icon.id+' invisible');}
});

test('revised industrial models embed decodable material maps',async()=>{
 for(const spec of MODEL_SPECS.filter(x=>['01','13'].includes(x.packageId))){const b=read(spec.file),size=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+size).toString()),start=28+size;assert.ok(j.images.length>=12,spec.id);for(const m of j.materials.filter(x=>x.pbrMetallicRoughness.baseColorTexture)){assert.ok(m.normalTexture&&m.occlusionTexture&&m.pbrMetallicRoughness.metallicRoughnessTexture);}
 for(const img of j.images){const v=j.bufferViews[img.bufferView],meta=await sharp(b.subarray(start+v.byteOffset,start+v.byteOffset+v.byteLength)).metadata();assert.equal(meta.width,64);assert.equal(meta.height,64);}}
});

function closedMesh(parts){
 for(const p of parts.filter(x=>x.kind==='mesh')){
  const edges=new Map();let volume=0;
  for(const t of p.triangles){const [a,b,c]=t.map(i=>p.vertices[i]);volume+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);
   for(let j=0;j<3;j++){const a=t[j],b=t[(j+1)%3],key=a<b?a+':'+b:b+':'+a,e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);}
  }
  if([...edges.values()].some(([n,d])=>n!==2||d!==0)||volume<=0)throw Error('inconsistent closed mesh: '+p.material+' volume '+volume);
 }
}
import { build as menderParts } from '../tools/assets/originals/11-mender.mjs';
import { build as colonyParts } from '../tools/assets/originals/14-crystallogenic.mjs';
import { build as floraParts } from '../tools/assets/originals/15-flora.mjs';
test('closed custom meshes have consistent outward winding and paired edges',()=>{
 const builders={'11':menderParts,'14':colonyParts,'15':floraParts};
 for(const spec of MODEL_SPECS.filter(s=>builders[s.packageId]))closedMesh(builders[spec.packageId](spec.args));
});
