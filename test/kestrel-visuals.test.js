import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DEEP, PROPS, hasLineOfSight } from '../shared/world.js';
import { buildKestrelDeepVisuals, KESTREL_KIT_PIECES } from '../client/src/kestrel-deep-visuals.js';

test('Kestrel reconstruction builds without bundled GLBs; remains presentation only', () => {
  const before = PROPS.filter(p => p.type.startsWith('deep_')).map(p => ({...p}));
  const rig = buildKestrelDeepVisuals(THREE, DEEP, null, {detail:0.4,reducedMotion:()=>true});
  assert.equal(rig.group.name,'kestrel:visual-reconstruction');
  assert.deepEqual(rig.group.position.toArray(),[DEEP.x,DEEP.floor,DEEP.z]);
  assert.equal(rig.stats.colliderChanges,0);
  assert.equal(rig.stats.kitPieces,0);
  assert.ok(rig.group.getObjectByName('kestrel:bulkhead-cassettes'));
  assert.ok(rig.group.getObjectByName('kestrel:roof-crossbeams'));
  assert.ok(rig.group.getObjectByName('kestrel:pressure-diagnostic'));
  assert.doesNotThrow(() => rig.update(1/60,1,{x:DEEP.x,z:DEEP.z}));
  assert.doesNotThrow(() => rig.update(1/60,100,{x:200,z:200}));
  assert.deepEqual(PROPS.filter(p => p.type.startsWith('deep_')),before);
  assert.equal(hasLineOfSight({x:DEEP.x,z:DEEP.z},{x:DEEP.x+DEEP.hw+2,z:DEEP.z}),true);
  assert.equal(rig.group.visible,false);
});

test('production GLB kit pieces are fitted within existing walls/roof without an entry obstruction', () => {
  const requested = [];
  const assets = {
    get(id) { return id === 'sanctum' ? {pieces:new Map()} : null; },
    instance(id,piece) {
      assert.equal(id,'sanctum');
      requested.push(piece);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),new THREE.MeshStandardMaterial()));
      return g;
    },
  };
  const rig = buildKestrelDeepVisuals(THREE, DEEP, assets, {detail:1});
  assert.ok(rig.stats.kitPieces >= 16);
  assert.ok(requested.every(name => KESTREL_KIT_PIECES.includes(name)));
  assert.ok(requested.includes('Prop_Computer'));
  assert.ok(requested.includes('Prop_Vent_Big'));
  assert.ok(requested.includes('Column_Hollow'));
  assert.ok(rig.stats.motes > 0);
  // All new floor plates and diagnostics remain below a nominal step.
  const floor=rig.group.getObjectByName('kestrel:machined-floor-tiles');
  assert.ok(floor.isInstancedMesh && floor.count > 30);
  const m=new THREE.Matrix4(), v=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
  for(let i=0;i<floor.count;i++){
    floor.getMatrixAt(i,m); m.decompose(v,q,s);
    assert.ok(v.y+s.y/2 < .12);
  }
  // The loading-facing eastern opening is untouched by lab wall cladding.
  const wall=rig.group.getObjectByName('kestrel:bulkhead-cassettes');
  for(let i=0;i<wall.count;i++) {
    wall.getMatrixAt(i,m); m.decompose(v,q,s);
    assert.ok(v.x + s.x/2 < DEEP.hw-.2);
  }
  assert.doesNotThrow(()=>rig.update(1/60,4,{x:DEEP.x,z:DEEP.z}));
  assert.ok(rig.group.visible);
});
