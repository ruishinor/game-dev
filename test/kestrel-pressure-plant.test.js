import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {DEEP,PROPS} from '../shared/world.js';
import {buildKestrelPressurePlant,KESTREL_PLANT_LIMITS} from '../client/src/kestrel-pressure-plant.js';
import {buildKestrelDeepVisuals} from '../client/src/kestrel-deep-visuals.js';

test('twin dynamo machinery is structurally different from cosmetic lab wall paneling',()=>{
 const before=PROPS.length;
 const model=buildKestrelPressurePlant(T);
 assert.equal(model.stats.dynamos,2);
 assert.equal(model.stats.colliderChanges,0);
 assert.equal(model.stats.newLights,0);
 assert.equal(KESTREL_PLANT_LIMITS.lights,0);
 assert.equal(PROPS.length,before);
 const names=new Set();
 model.group.traverse(o=>names.add(o.name));
 for(const name of ['kestrel:dynamo-yoke','kestrel:overhead-feed-line','kestrel:manifold-control-hub','kestrel:dynamo-kinetic-rotor:0','kestrel:dynamo-kinetic-rotor:1','kestrel:manifold-stabilizer']){
  assert.ok(names.has(name),'expected recognizable physical machinery: '+name);
 }
 const motors=[0,1].map(i=>model.group.getObjectByName('kestrel:dynamo-kinetic-rotor:'+i));
 model.update(6,{reducedMotion:false});
 assert.ok(motors.some(m=>m.rotation.z!==0));
 model.update(6,{reducedMotion:true});
 assert.ok(motors.every(m=>m.rotation.z===0));
 model.dispose();
});
test('major Kestrel machinery attaches to the existing vessel footprints without blocking east entry',()=>{
 const rig=buildKestrelDeepVisuals(T,DEEP,null,{detail:1});
 assert.ok(rig.group.getObjectByName('kestrel:pressure-plant'));
 assert.equal(rig.stats.plant.dynamos,2);
 assert.equal(rig.stats.colliderChanges,0);
 const m=rig.group.getObjectByName('kestrel:manifold-control-hub');
 assert.ok(m);
 assert.ok(m.position.x<0,'pressure equipment is mounted along western containment row');
 assert.ok(Math.abs(m.position.x)<DEEP.hw);
 assert.ok(m.position.y>2.3,'no waist-high obstacle in open player route');
 assert.doesNotThrow(()=>rig.update(.016,3,{x:DEEP.x,z:DEEP.z}));
});
