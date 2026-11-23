import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {RIFT_ANNEX, ANNEX_PARTITIONS, COLLIDERS} from '../shared/world.js';
import {ANNEX_ROOMS, ANNEX_SHELL_HEIGHT, createAnnexInterior} from '../client/src/annex-interior.js';
import {makeAnnexRecoveryCache} from '../client/src/annex-cache.js';

test('Phase Annex owns three enclosed and structurally different chamber identities',()=>{
 const before=COLLIDERS.length,partitions=ANNEX_PARTITIONS.length;
 const visual=createAnnexInterior(T,RIFT_ANNEX);
 const roofs=[],rooms=[],names=new Set();
 visual.group.traverse(o=>{
   names.add(o.name);
   if(o.name.startsWith('annex:roof:'))roofs.push(o);
   if(o.name.startsWith('annex:room:'))rooms.push(o);
 });
 assert.equal(visual.stats.rooms,3);
 assert.equal(visual.stats.roofs,3);
 assert.equal(visual.stats.colliderChanges,0);
 assert.equal(COLLIDERS.length,before);
 assert.equal(ANNEX_PARTITIONS.length,partitions);
 assert.equal(rooms.length,3);
 assert.deepEqual(ANNEX_ROOMS.map(r=>r.name),['Arrival Gallery','Relay Workshop','Null Chamber']);
 for(const key of ['annex:arrival-arched-bay','annex:relay-pressure-line','annex:null-containment-busbar','annex:door-header','annex:upper-perimeter']){
   assert.ok(names.has(key),'Missing '+key);
 }
 for(const roof of roofs){
   assert.ok(roof.position.y>=ANNEX_SHELL_HEIGHT,'each room hides exterior sky');
   assert.ok(roof.geometry.parameters.width>=RIFT_ANNEX.hw*2,'the ceiling spans the chamber');
 }
 visual.update({x:RIFT_ANNEX.x,y:3,z:RIFT_ANNEX.arrivalZ});
 assert.equal(visual.group.visible,true);
 assert.ok(roofs.every(r=>r.material.opacity===1));
 visual.update({x:RIFT_ANNEX.x,y:ANNEX_SHELL_HEIGHT+2,z:RIFT_ANNEX.arrivalZ});
 assert.ok(roofs.some(r=>r.material.opacity<1),'roof softens if third-person camera rises through it');
 visual.update({x:0,y:2,z:0});
 assert.equal(visual.group.visible,false,'distant Annex geometry must cull');
 visual.dispose();
});
test('the Annex recovery cache is a distinct source-derived model, not two cuboids',()=>{
 const cache=makeAnnexRecoveryCache(T);
 const nodes=[];
 cache.group.traverse(o=>{if(o.isMesh)nodes.push(o)});
 assert.equal(cache.kind,'glb-derived');
 assert.ok(nodes.length>20,'a detailed mechanized case is rendered');
 assert.ok(nodes.some(o=>o.name==='annex-cache:quarantine-sensor'));
 assert.ok(nodes.some(o=>o.name==='annex-cache:perimeter-sigil'));
 assert.ok(cache.group.getObjectByName('depths:source-059-loot-cache-legendary'));
 cache.update(.1,{t:8,reducedMotion:false});
 cache.update(.1,{t:8,reducedMotion:true});
 cache.dispose();
});
