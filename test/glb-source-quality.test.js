import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGltf, readGltf, zipMembers } from '../tools/assets/glb-source-quality.mjs';

function glb(doc) {
  const json=Buffer.from(JSON.stringify(doc));
  const pad=(4-json.length%4)%4;
  const out=Buffer.alloc(20+json.length+pad,0x20);
  out.write('glTF',0,'ascii');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
  out.writeUInt32LE(json.length+pad,12);out.writeUInt32LE(0x4e4f534a,16);
  json.copy(out,20);
  return out;
}
test('asset review counts actual triangles, normals, UVs and PBR texture bindings',()=>{
  const doc={asset:{version:'2.0'},accessors:[{count:9},{count:9},{count:9},{count:6}],
    meshes:[{primitives:[
      {attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},material:0},
      {indices:3,attributes:{POSITION:0,COLOR_0:2},mode:4,material:1}
    ]}],
    nodes:[{},{}],materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0}}},{}],
    images:[{uri:'albedo.png'}],textures:[{source:0}]};
  const v=summarizeGltf(readGltf(glb(doc)));
  assert.equal(v.triangles,5);
  assert.equal(v.normals,1);
  assert.equal(v.uv0,1);
  assert.equal(v.materialsWithTexture,1);
  assert.ok(v.qualitySignals.includes('some_primitives_lack_normals'));
  assert.ok(v.qualitySignals.includes('some_primitives_lack_uv0'));
  assert.equal(v.rightsVerified,false);
  assert.equal(v.visualAcceptance,false);
  assert.equal(v.productionReady,false);
});
test('invalid GLBs fail closed instead of being treated as viable source',()=>{
  assert.throws(()=>readGltf(Buffer.from('bad data')),/Invalid GLB/);
  assert.throws(()=>readGltf(glb({asset:{version:'1.0'},meshes:[]})),/Invalid glTF/);
  const truncated=glb({asset:{version:'2.0'},meshes:[]}).subarray(0,20);
  assert.throws(()=>readGltf(truncated),/Invalid GLB/);
});
test('ZIP parser refuses a corrupt or missing archive directory',()=>{
  assert.throws(()=>[...zipMembers(Buffer.alloc(100))],/Missing ZIP/);
});
