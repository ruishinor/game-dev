import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {ensureWardenRifleGLB,WARDEN_RIFLE_NODES} from '../tools/assets/warden-rifle-source.mjs';

function inspect(buf){
 assert.equal(buf.toString('ascii',0,4),'glTF');
 assert.equal(buf.readUInt32LE(8),buf.length);
 const n=buf.readUInt32LE(12);
 return JSON.parse(buf.toString('utf8',20,20+n));
}
test('Warden rifles: exact archive submodels extracted, not entire outpost',()=>{
 const seen=[];
 for(const id of Object.keys(WARDEN_RIFLE_NODES)){
  const path=ensureWardenRifleGLB(id);
  const raw=fs.readFileSync(path),glb=inspect(raw);
  assert.ok(raw.length>1000&&raw.length<750000,'trimmed GLB size');
  assert.equal(glb.scenes.length,1);
  assert.equal(glb.scenes[0].nodes.length,1);
  assert.equal(glb.nodes[0].name,WARDEN_RIFLE_NODES[id]);
  assert.ok(glb.meshes.length>=2);
  assert.ok(glb.nodes.every(n=>!n.name.includes('loot-cache')&&!n.name.includes('figure-')),'no extraneous pack meshes');
  assert.ok(glb.bufferViews.every(v=>(v.byteOffset||0)+v.byteLength<=glb.buffers[0].byteLength));
  const count=glb.meshes.reduce((n,m)=>n+m.primitives.reduce((s,p)=>s+(p.indices!==undefined?glb.accessors[p.indices].count/3:glb.accessors[p.attributes.POSITION].count/3),0),0);
  assert.ok(count>=100&&count<50000,'rifle triangle budget '+count);
  seen.push(path);
 }
 assert.notEqual(seen[0],seen[1]);
});
test('Warden rifles: selector fails closed for unknown assets',()=>{
 assert.throws(()=>ensureWardenRifleGLB('../source-archives/foo'),/Unexpected/);
});

test('each extracted rifle donor loads through the actual Three.js GLTFLoader',async()=>{
 const loader=new GLTFLoader();
 for(const id of Object.keys(WARDEN_RIFLE_NODES)){
  const file=ensureWardenRifleGLB(id);
  const data=fs.readFileSync(file);
  const gltf=await new Promise((resolve,reject)=>loader.parse(
   data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),
   '',resolve,reject));
  let visibleMeshes=0;
  gltf.scene.traverse(o=>{if(o.isMesh)visibleMeshes++;});
  assert.ok(visibleMeshes>=2, id+' must construct visible GLTFLoader meshes');
 }
});
