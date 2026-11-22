import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEPTHS_MEMBER, DEPTHS_NODE, DEPTHS_ARCHIVE, ensureDepthsCacheGLB, isolateDepthsCacheGLB, readZipMember } from '../tools/assets/extract-depths-cache.mjs';
import { DEPTHS_CACHE_URL } from '../client/src/depths-cache.js';

const unpack = data => {
  assert.equal(data.toString('ascii',0,4),'glTF');
  assert.equal(data.readUInt32LE(4),2);
  assert.equal(data.readUInt32LE(8),data.length);
  const jsonLength=data.readUInt32LE(12);
  assert.equal(data.readUInt32LE(16),0x4e4f534a);
  const doc=JSON.parse(data.toString('utf8',20,20+jsonLength));
  const offset=20+jsonLength;
  assert.equal(data.readUInt32LE(offset+4),0x004e4942);
  assert.equal(data.readUInt32LE(offset)+offset+8,data.length);
  return doc;
};

test('the owner archive produces only the selected cache, not a full outpost scene',()=>{
  const original=readZipMember(fs.readFileSync(DEPTHS_ARCHIVE), DEPTHS_MEMBER);
  const output=isolateDepthsCacheGLB(original);
  const gltf=unpack(output);
  assert.equal(gltf.scenes.length,1);
  assert.equal(gltf.nodes[0].name,DEPTHS_NODE);
  assert.deepEqual(gltf.nodes[0].translation,[0,0,0]);
  assert.equal(gltf.meshes.length,7);
  assert.ok(gltf.nodes.length<=10);
  assert.ok(output.length<200_000,'must omit the other 469 meshes');
  for(const mesh of gltf.meshes)for(const p of mesh.primitives){
    assert.ok(p.indices<gltf.accessors.length);
    assert.ok(p.material<gltf.materials.length);
    for(const id of Object.values(p.attributes))assert.ok(id<gltf.accessors.length);
  }
  assert.ok(gltf.nodes.every(n=>!n.name.includes('palisade')));
  assert.ok(gltf.bufferViews.every(v=>v.byteOffset+v.byteLength<=gltf.buffers[0].byteLength));
  assert.ok(DEPTHS_CACHE_URL.startsWith('/client/assets/depths-recovery-cache.glb'));
});

test('generated GLB stays outside source ZIP web mounts and builds deterministically',()=>{
  const file=ensureDepthsCacheGLB();
  assert.ok(file.endsWith(path.join('.asset-cache', 'depths-recovery-cache.glb')));
  assert.equal(unpack(fs.readFileSync(file)).nodes[0].name,DEPTHS_NODE);
  assert.equal(ensureDepthsCacheGLB(),file);
});