import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {buildLumenfenGlbAccents,LUMENFEN_GLB_PIECES} from '../client/src/lumenfen-glb-accents.js';

test('Lumenfen accent components use real published runtime bundle names',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../client/assets/manifest.json',import.meta.url),'utf8'));
  const pieces=manifest.assets.nature.pieces;
  assert.ok(LUMENFEN_GLB_PIECES.length>=5);
  for(const name of LUMENFEN_GLB_PIECES)
    assert.ok(Object.hasOwn(pieces,name),'registered nature kit lacks '+name);
});

test('site undergrowth uses bounded instanced GLB meshes and never owns source material',()=>{
  const geo=new T.BoxGeometry(1,.35,1),mat=new T.MeshStandardMaterial({color:0x576e5d});
  const requests=[];
  const source={get:id=>id==='nature'?{}:null,instance:(id,piece)=>{
    assert.equal(id,'nature');requests.push(piece);
    const root=new T.Group(),leaf=new T.Mesh(geo,mat);
    leaf.position.set(.12,.08,0);root.add(leaf);
    return root;
  }};
  const result=buildLumenfenGlbAccents(T,source),status=result.stats();
  assert.ok(status.placed>=350&&status.eligible<=500,
    'real nature-GLB details must now extend throughout the watershed');
  assert.ok(status.batches>=5&&status.batches<=12,
    'runtime foliage is batched by actual GLB mesh/material');
  assert.deepEqual(status.missing,[]);
  assert.ok(result.group.children.every(o=>o.isInstancedMesh&&o.geometry===geo&&o.material===mat));
  const matrix=new T.Matrix4();
  result.group.children[0].getMatrixAt(0,matrix);
  const position=new T.Vector3().setFromMatrixPosition(matrix);
  assert.ok(Number.isFinite(position.x)&&Number.isFinite(position.y)&&Number.isFinite(position.z));
  result.dispose();
  assert.equal(result.group.parent,null);
  assert.ok(geo.attributes.position.count>0,'shared GLB geometry must remain alive');
  mat.dispose();geo.dispose();
});

test('absence of optional visual kit never affects gameplay or invents fallback errors',()=>{
  const unavailable=buildLumenfenGlbAccents(T,null);
  assert.equal(unavailable.group.children.length,0);
  assert.deepEqual(unavailable.stats().missing,[]);
  assert.equal(unavailable.stats().placed,0);
  unavailable.dispose();

  const partial=buildLumenfenGlbAccents(T,{
    get:id=>id==='nature'?{}:null,
    instance:()=>null,
  });
  assert.ok(partial.stats().missing.length>0,'present-but-incomplete asset bundle must be observable');
  assert.equal(partial.group.children.length,0);
  partial.dispose();
});
