import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildSinterHabitat } from '../client/src/sinter-habitat.js';
import { SINTER_SITES, groundHeight } from '../shared/world.js';

test('Sinter habitat is deterministic, terrain-conforming, bounded and static',()=>{
  const root=buildSinterHabitat(THREE),repeat=buildSinterHabitat(THREE);
  root.updateMatrixWorld(true);
  assert.equal(root.children.length,2);
  let total=0;
  for(const [name,site] of [['nursery',SINTER_SITES.nursery],['mineral-bed',SINTER_SITES.mineral]]){
    const group=root.getObjectByName('sinter:'+name);
    assert.ok(group);
    const membranes = group.children.filter(mesh => mesh.name === 'sinter:' + name + ':membrane');
    assert.equal(membranes.length, 1, 'one folded membrane per habitat');
    const mesh = membranes[0];
    const other = repeat.getObjectByName(mesh.name);
    const p=mesh.geometry.getAttribute('position'),colors=mesh.geometry.getAttribute('color'),normal=mesh.geometry.getAttribute('normal');
    assert.ok(mesh.material.vertexColors&&!mesh.material.transparent);
    assert.equal(colors.count,p.count);assert.equal(normal.count,p.count);
    assert.deepEqual(p.array,other.geometry.getAttribute('position').array);
    assert.deepEqual(colors.array,other.geometry.getAttribute('color').array);
    const v=new THREE.Vector3();
    for(let i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
      assert.ok([v.x,v.y,v.z,normal.getX(i),normal.getY(i),normal.getZ(i)].every(Number.isFinite));
      assert.ok(Math.hypot(v.x-site.x,v.z-site.z)<site.r);
      const h=v.y-groundHeight(v.x,v.z);
      assert.ok(h>=-.025&&h<=.30,'passable relief envelope');
      assert.ok(normal.getY(i)>0,'upward-facing folded surface');
      for(const c of [colors.getX(i),colors.getY(i),colors.getZ(i)])assert.ok(c>=0&&c<=1);
    }
    assert.ok(mesh.geometry.index.count%3===0);
    for(const i of mesh.geometry.index.array)assert.ok(i>=0&&i<p.count);
    total+=p.count;
  }
  assert.ok(total>2500&&total<15000,'two bounded membrane draw batches');
});
