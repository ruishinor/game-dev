import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function readGlb(path,refined=false){
  const dir=refined?'../client/assets/brineworks-refined/':'../client/art-assets/';
  const b=readFileSync(new URL(dir+path,import.meta.url));
  assert.equal(b.toString('ascii',0,4),'glTF');
  assert.equal(b.readUInt32LE(4),2);
  assert.equal(b.readUInt32LE(8),b.length);
  const jlen=b.readUInt32LE(12);
  assert.equal(b.toString('ascii',16,20),'JSON');
  const doc=JSON.parse(b.toString('utf8',20,20+jlen).trim());
  const bo=20+jlen;
  assert.equal(b.toString('ascii',bo+4,bo+8),'BIN\\0'.replace('\\0','\u0000'));
  assert.equal(doc.buffers[0].byteLength,b.readUInt32LE(bo));
  assert.equal(bo+8+b.readUInt32LE(bo),b.length);
  for(const view of doc.bufferViews){
    assert.equal((view.byteOffset||0)%4,0);
    assert.ok((view.byteOffset||0)+view.byteLength<=doc.buffers[0].byteLength);
  }
  return {b,doc,binOffset:bo+8};
}
const cases=[
  ['research_tabletop_module.glb','research_tabletop_module_refined.glb',3044,27396,'c3ff18bf610d00bf742af1e5184afe88cdaccb96'],
  ['engineering_tabletop_module.glb','engineering_tabletop_module_refined.glb',3376,30384,'39962b22333f7959260c2155ce0916103cfdacc8']
];
for(const [original,refined,baseline,expected,sourceSha] of cases){
 test(refined+' is a genuinely remeshed, indexed, textured GLB',()=>{
   const old=readGlb(original),hi=readGlb(refined,true),g=hi.doc;
   assert.equal(g.asset.extras.sourceBlobSha,sourceSha);
   assert.match(g.asset.generator,/PN cubic remesher/);
   assert.ok(g.extensionsUsed.includes('KHR_materials_clearcoat'));
   assert.equal(g.images.length,old.doc.images.length);
   assert.equal(g.materials.length,old.doc.materials.length);
   let oldTriangles=0,highTriangles=0;
   for(const mesh of old.doc.meshes)for(const p of mesh.primitives){
     const a=old.doc.accessors[p.attributes.POSITION];oldTriangles+=(p.indices!==undefined?old.doc.accessors[p.indices].count:a.count)/3;
   }
   for(const mesh of g.meshes)for(const p of mesh.primitives){
     assert.equal(p.mode??4,4);
     const pos=g.accessors[p.attributes.POSITION],normal=g.accessors[p.attributes.NORMAL],uv=g.accessors[p.attributes.TEXCOORD_0],indices=g.accessors[p.indices];
     assert.equal(pos.count,normal.count);assert.equal(pos.count,uv.count);
     assert.equal(indices.componentType,5123);
     assert.equal(indices.count%3,0);
     highTriangles+=indices.count/3;
     const iv=g.bufferViews[indices.bufferView],io=hi.binOffset+(iv.byteOffset||0)+(indices.byteOffset||0);
     for(let i=0;i<indices.count;i++)assert.ok(hi.b.readUInt16LE(io+i*2)<pos.count);
     for(const [i,lo] of pos.min.entries())assert.ok(Number.isFinite(lo)&&lo<=pos.max[i]);
   }
   assert.equal(oldTriangles,baseline);
   assert.equal(highTriangles,expected);
   assert.equal(highTriangles,oldTriangles*9);
   assert.ok(g.materials.some(x=>x.normalTexture&&x.normalTexture.scale>=.65));
 });
}
