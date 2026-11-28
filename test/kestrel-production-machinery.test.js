import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { DEEP, PROPS, hasLineOfSight } from '../shared/world.js';
import { buildKestrelProductionMachinery, KESTREL_MACHINERY_LIMITS } from '../client/src/kestrel-production-machinery.js';
import { buildKestrelPressurePlant } from '../client/src/kestrel-pressure-plant.js';

test('two Kestrel compressors are explicit, fitted machines with an efficient draw budget', () => {
  const before = PROPS.filter(p=>p.type.startsWith('deep_')).map(p=>({...p}));
  const rig = buildKestrelProductionMachinery(T);
  assert.equal(rig.stats.units,2);
  assert.equal(rig.stats.batchMeshes,8);
  assert.equal(rig.stats.rotors,2);
  assert.equal(rig.stats.conduitMeshes,2);
  assert.equal(rig.stats.drawMeshes,14);
  assert.equal(rig.stats.newLights,0);
  assert.equal(rig.stats.colliderChanges,0);
  assert.equal(KESTREL_MACHINERY_LIMITS.newLights,0);
  const names = [];
  const meshList = [];
  rig.group.traverse(o=>{
    names.push(o.name);
    if(o.isMesh)meshList.push(o);
  });
  for(const name of [
    'kestrel:compressor-pressure-shells',
    'kestrel:compressor-heat-fins',
    'kestrel:compressor-blades',
    'kestrel:compressor-to-feed',
    'kestrel:compressor-face-bolts',
    'kestrel:compressor-status-bars',
  ])assert.ok(names.includes(name),'missing visible machinery component: '+name);
  assert.equal(rig.group.children.filter(o=>o.name==='kestrel:compressor-to-feed').length,2);
  assert.equal(meshList.length,14);
  const bounds=new T.Box3().setFromObject(rig.group);
  assert.ok(bounds.min.x>-DEEP.hw && bounds.max.x<-2.5,'keep equipment on vessel side');
  assert.ok(bounds.min.y>2.4 && bounds.max.y<DEEP.roofBottom-DEEP.floor,'respect roof and standing headroom');
  assert.ok(bounds.min.z>-DEEP.hd && bounds.max.z<DEEP.hd);
  for(const mesh of meshList){
    assert.ok(mesh.geometry.getAttribute('position').array.every(Number.isFinite));
    if(mesh.isInstancedMesh){
      assert.ok(mesh.count>0);
      for(let i=0;i<mesh.count;i++){
        const transform=new T.Matrix4();
        mesh.getMatrixAt(i,transform);
        assert.ok(transform.elements.every(Number.isFinite));
      }
    }
  }
  const rotor=rig.group.getObjectByName('kestrel:compressor-impeller:0');
  rig.update(12,{reducedMotion:false});
  assert.notEqual(rotor.rotation.x,0);
  rig.update(12,{reducedMotion:true});
  assert.equal(rotor.rotation.x,0);
  assert.deepEqual(PROPS.filter(p=>p.type.startsWith('deep_')),before);
  assert.equal(hasLineOfSight({x:DEEP.x,z:DEEP.z},
    {x:DEEP.x+DEEP.hw+2,z:DEEP.z}),true);
  rig.dispose();
});

test('new production compressors integrate into existing pressure plant', () => {
  const plant=buildKestrelPressurePlant(T);
  assert.equal(plant.stats.productionUnits,2);
  assert.equal(plant.stats.productionDrawMeshes,14);
  assert.ok(plant.group.getObjectByName('kestrel:compressor-to-feed'));
  assert.equal(plant.stats.newLights,0);
  assert.equal(plant.stats.colliderChanges,0);
  plant.update(10,{reducedMotion:false});
  plant.dispose();
});
