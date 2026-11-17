import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import validator from 'gltf-validator';
import sharp from 'sharp';
import { MODEL_SPECS,generateOriginals } from '../tools/assets/originals/catalog.mjs';
import { verify } from '../tools/assets/originals/geometry.mjs';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../client/art-assets');
const read=rel=>fs.readFileSync(path.join(dir,rel));
test('original art: all files regenerate byte-for-byte and inventory is exact',()=>{
 const all=generateOriginals();assert.equal(MODEL_SPECS.length,31);
 const seen=fs.readdirSync(dir,{recursive:true}).filter(f=>fs.statSync(path.join(dir,f)).isFile()).map(x=>x.split(path.sep).join('/')).sort();
 assert.deepEqual(seen,[...all.keys()].sort());
 for(const [rel,bytes] of all)assert.ok(read(rel).equals(bytes),rel+' differs from generator');
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
